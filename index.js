/**
 * 神探狄仁杰机器人 · Host 半边。
 *
 * 本地素材检索、同源 JSON 接口、DSH 模型或机器人专用 OpenAI 兼容 API。
 * 专用 API 凭据只从 Host 环境读取，不从浏览器或 QQ 机器人配置文件读取。
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { ShendiStore } from './lib/store.js'
import { answerQuestion } from './lib/answer.js'
import { generateQuiz } from './lib/quiz.js'
import { cachedModels, resolveSelection } from './lib/llm.js'
import { CUSTOM_NAME, CUSTOM_PROVIDER, readCustomApi } from './lib/custom-api.js'

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const ROUTE_PREFIX = '/shendi-bot/api'
const MAX_BODY_BYTES = 256 * 1024
const DATA_FILES = ['corpus.json', 'plot.json', 'characters.json', 'nouns.json']

export const name = 'shendi-bot'

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求内容过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, payload, status = 200) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * 素材目录：显式配置 → SHENDI_DATA_DIR → <包目录>/../data → <包目录>/data。
 * 包内自带一份素材快照（data/），所以装完就能用；并行目录里的新鲜素材优先。
 * @param {{dataDir?: string}} config
 */
function resolveDataDir(config) {
  if (typeof config.dataDir === 'string' && config.dataDir.trim()) {
    return path.resolve(packageDir, config.dataDir.trim())
  }
  if (process.env.SHENDI_DATA_DIR) return path.resolve(process.env.SHENDI_DATA_DIR)
  const candidates = [path.resolve(packageDir, '..', 'data'), path.join(packageDir, 'data')]
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'corpus.json'))) return dir
  }
  return candidates[candidates.length - 1]
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{dataDir?: string, maxEvidenceChars?: number, maxAnswerTokens?: number,
 *          quizMaxTokens?: number, requestTimeoutMs?: number, quizTimeoutMs?: number,
 *          provider?: string, model?: string, preferNative?: boolean}} [config]
 */
export function apply(ctx, config = {}) {
  const dataDir = resolveDataDir(config)
  const settings = {
    maxEvidenceChars: clampInt(config.maxEvidenceChars, 1200, 12000, 5600),
    maxAnswerTokens: clampInt(config.maxAnswerTokens, 256, 4000, 1500),
    quizMaxTokens: clampInt(config.quizMaxTokens, 256, 4000, 1600),
    requestTimeoutMs: clampInt(config.requestTimeoutMs, 5000, 300000, 120000),
    quizTimeoutMs: clampInt(config.quizTimeoutMs, 5000, 300000, 90000),
    provider: typeof config.provider === 'string' ? config.provider : '',
    model: typeof config.model === 'string' ? config.model : '',
    preferNative: config.preferNative === true,
    customApi: readCustomApi(),
  }
  const customGroup = settings.customApi && !settings.customApi.error
    ? { id: CUSTOM_PROVIDER, name: CUSTOM_NAME, models: [settings.customApi.model] }
    : null

  // 浏览器只选已知提供方与模型 ID；不能通过请求传入端点或凭据。
  const routeOf = (body) => {
    const provider = typeof body?.provider === 'string' ? body.provider.trim() : ''
    const model = typeof body?.model === 'string' ? body.model.trim() : ''
    if (!provider && !model && body?.provider == null && body?.model == null) return settings
    if (!provider || !model || model.length > 256) throw badRoute('请选择完整的提供方与模型。')
    if (provider === CUSTOM_PROVIDER) {
      if (!customGroup || model !== settings.customApi.model) {
        throw badRoute('机器人专用模型已变更或尚未配置，请刷新模型列表后重选。')
      }
    } else if (!listProviders(ctx).some((item) => item.id === provider)) {
      throw badRoute('所选提供方未在 DSH 注册，请在「设置 → 模型」中添加后刷新列表。')
    }
    return { ...settings, manual: { provider, model } }
  }

  const log = (message) => {
    try {
      ctx.logger?.info?.(`[shendi-bot] ${message}`)
    } catch {
      // 日志不可用时静默
    }
  }

  const store = new ShendiStore(dataDir, { maxEvidenceChars: settings.maxEvidenceChars, log })
  log(`素材目录：${dataDir}`)

  const dataHint = `把 ${DATA_FILES.join(' / ')} 放进 ${dataDir}，或在插件配置里设 dataDir（也可用环境变量 SHENDI_DATA_DIR）。`

  const statusPayload = async () => {
    // 模型路由每次现读 DSH：用户在「设置 → 模型」里换一个，这里立刻跟着变
    let model = null
    let modelError = ''
    try {
      const selection = await resolveSelection(ctx, settings)
      model = { provider: selection.provider, model: selection.model, source: selection.source }
    } catch (error) {
      modelError = error instanceof Error ? error.message : String(error)
    }
    const base = {
      ok: true,
      model,
      modelError,
      providers: [...(customGroup ? [{ id: customGroup.id, name: customGroup.name }] : []), ...listProviders(ctx)],
      ready: store.ready,
    }
    try {
      await store.ensure()
    } catch (error) {
      return {
        ...base,
        ok: false,
        ready: false,
        error: `读取台词素材失败：${error instanceof Error ? error.message : String(error)}`,
        hint: dataHint,
      }
    }
    return { ...base, ready: true, stats: store.stats, cases: store.caseList }
  }

  const handle = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.slice(ROUTE_PREFIX.length) || '/'
    const site = req.headers['sec-fetch-site']
    const origin = req.headers.origin
    const localHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(req.headers.host ?? '')
    const localPeer = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress ?? '')
    const expectedOrigin = `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`
    // 模型调用可能消耗配额。此面板仅服务本机 Web，不对公网或跨源页面提供转发。
    if (!localHost || !localPeer || (site && site !== 'same-origin' && site !== 'none') || (origin && origin !== expectedOrigin)) {
      sendJson(res, { ok: false, error: '机器人接口仅允许本机同源访问。' }, 403)
      return
    }
    try {
      if (route === '/status' && (req.method === 'GET' || req.method === 'POST')) {
        sendJson(res, await statusPayload())
        return
      }
      if (route === '/ask' && req.method === 'POST') {
        const body = await readBody(req)
        const question = String(body.question ?? '').trim()
        if (!question) {
          sendJson(res, { ok: false, error: '问题不能为空' }, 400)
          return
        }
        const result = await answerQuestion(store, ctx, routeOf(body), {
          question,
          history: Array.isArray(body.history) ? body.history : [],
          historyRoute: body.historyRoute,
        })
        sendJson(res, { ok: true, ...result })
        return
      }
      if (route === '/quiz' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await generateQuiz(store, ctx, routeOf(body), {
          cases: body.cases,
          count: body.count,
          forms: body.forms,
          settings: body.settings,
        })
        sendJson(res, { ok: true, ...result })
        return
      }
      if (route === '/models' && req.method === 'GET') {
        // 面板的模型选择器：列出 DSH 里注册的 provider 与各自模型（只有 id/名称，没有凭据）
        const groups = await Promise.all(listProviders(ctx).map(async (provider) => ({
          ...provider, models: await cachedModels(ctx, provider.id, url.searchParams.get('refresh') === '1'),
        })))
        const providers = [...(customGroup ? [customGroup] : []), ...groups]
        let auto = null
        try {
          const selection = await resolveSelection(ctx, settings)
          auto = { provider: selection.provider, model: selection.model, source: selection.source }
        } catch {
          auto = null
        }
        sendJson(res, { ok: true, providers, auto })
        return
      }
      sendJson(res, { ok: false, error: `未知接口 ${req.method} ${route}` }, 404)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log(`接口 ${route} 失败：${message}`)
      const status = error && error.status === 400 ? 400 : 500
      sendJson(res, { ok: false, error: message }, status)
    }
  }

  // webServer 可能比本插件更晚就绪（启动顺序、页面重开都会变），
  // 所以用 ctx.inject 等它出现，而不是在 apply 里读一次。
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() =>
      scope.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (req, res) => {
          handle(req, res).catch((error) => {
            log(`未捕获错误：${error instanceof Error ? error.message : String(error)}`)
            if (!res.headersSent) sendJson(res, { ok: false, error: '内部错误' }, 500)
            else res.destroy()
          })
        },
      }),
    )
    log(`接口已注册：${ROUTE_PREFIX}`)
  })
}

function badRoute(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function clampInt(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.round(number)))
}

/** DSH 里注册了适配器的 provider（只有 id 和显示名，没有凭据）。 */
function listProviders(ctx) {
  try {
    const llm = ctx.get?.('llm')
    if (!llm || typeof llm.listProviders !== 'function') return []
    return (llm.listProviders() ?? []).filter(({ id }) => id !== CUSTOM_PROVIDER).map(({ id, name }) => ({ id, name }))
  } catch {
    return []
  }
}
