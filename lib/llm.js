import { chatCustom, CUSTOM_PROVIDER } from './custom-api.js'

// 选择顺序：面板手选 → 专用 API → 插件配置 → DSH 默认模型。
// preferNative: true 是旧配置兼容选项；只有显式开启才优先选官方路由。
// 选路失败或调用失败时不把问题改发其他服务商。
export class LlmUnavailableError extends Error {}

const NATIVE_PROVIDERS = ['deepseek-official', 'deepseek-account']
const NATIVE_MODEL_PREFERENCE = ['deepseek-flash', 'deepseek-v4-pro']
const MODEL_CACHE_MS = 60_000

/** ctx -> Map<providerId, { at: number, models: string[] }> */
const modelCache = new WeakMap()

function providerIds(ctx) {
  try {
    const llm = ctx.get?.('llm')
    if (!llm || typeof llm.listProviders !== 'function') return []
    return (llm.listProviders() ?? []).map((provider) => provider.id)
  } catch {
    return []
  }
}

export async function cachedModels(ctx, provider, refresh = false) {
  const llm = ctx.get?.('llm')
  if (!llm || typeof llm.listModels !== 'function') return []
  let cache = modelCache.get(ctx)
  if (!cache) {
    cache = new Map()
    modelCache.set(ctx, cache)
  }
  const hit = cache.get(provider)
  if (!refresh && hit && Date.now() - hit.at < MODEL_CACHE_MS) return hit.models
  try {
    const models = (await llm.listModels(provider)).map((model) => model.id)
    cache.set(provider, { at: Date.now(), models })
    return models
  } catch {
    cache.set(provider, { at: Date.now(), models: [] })
    return []
  }
}

function pickNativeModel(models) {
  for (const id of NATIVE_MODEL_PREFERENCE) if (models.includes(id)) return id
  return models[0]
}

/**
 * 决定这次用哪个 provider/model。
 * @returns {Promise<{provider: string, model: string, reasoningEffort?: string, source: string}>}
 */
export async function resolveSelection(ctx, config = {}) {
  if (config.manual) {
    if (config.manual.provider === CUSTOM_PROVIDER) {
      return { provider: CUSTOM_PROVIDER, model: config.customApi.model, source: 'custom' }
    }
    return { ...config.manual, source: 'manual' }
  }
  if (config.customApi?.error) throw new LlmUnavailableError(config.customApi.error)
  if (config.customApi) return { provider: CUSTOM_PROVIDER, model: config.customApi.model, source: 'custom' }
  if (config.provider && config.model) {
    if (config.provider === CUSTOM_PROVIDER) throw new LlmUnavailableError('机器人专用 API 未配置。')
    return { provider: config.provider, model: config.model, source: 'config' }
  }

  const ids = providerIds(ctx).filter((id) => id !== CUSTOM_PROVIDER)

  if (config.preferNative === true) {
    for (const id of NATIVE_PROVIDERS) {
      if (!ids.includes(id)) continue
      const models = await cachedModels(ctx, id)
      if (models.length === 0) continue
      return { provider: id, model: pickNativeModel(models), source: 'dsh-native' }
    }
  }

  const service = ctx.get?.('agentDefaultModel')
  if (service && typeof service.currentSelection === 'function') {
    try {
      const selection = service.currentSelection()
      if (selection?.model && ids.includes(selection.provider)) {
        return {
          provider: selection.provider,
          model: selection.model,
          source: 'dsh-default',
          ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }),
        }
      }
    } catch {
      // 读不到就继续往下找
    }
  }

  for (const id of ids) {
    const models = await cachedModels(ctx, id)
    if (models.length > 0) return { provider: id, model: models[0], source: 'discovered' }
  }

  throw new LlmUnavailableError('DSH 里没有可用的模型路由：先在「设置 → 模型」里选一个再试')
}

async function runChat(ctx, llm, selection, request, config) {
  // `effort: null` 表示“这次不要带 reasoningEffort”，用于思考吃光预算后的重试
  const effort = request.effort === undefined ? selection.reasoningEffort : request.effort
  let text = ''
  let finish = null
  const stream = llm.stream({
    provider: selection.provider,
    model: selection.model,
    system: request.system,
    messages: request.messages,
    maxTokens: request.maxTokens ?? 1200,
    temperature: request.temperature ?? 0.3,
    // 面板没有 Agent 会话；网关仍要求一个会话标识来路由，给一个固定的即可
    sessionId: request.sessionId ?? config.sessionId ?? 'shendi-panel',
    ...(effort ? { reasoningEffort: effort } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  })
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') text += chunk.text
    else if (chunk.type === 'finish') finish = chunk.reason
  }
  if (finish && finish.kind === 'error') {
    const failure = finish.failure ?? {}
    const error = new Error(failure.message || '模型调用失败')
    error.code = failure.code
    throw error
  }
  if (finish && finish.kind === 'aborted') {
    const failure = finish.failure ?? {}
    const error = new Error(failure.message || '模型调用被中止')
    error.code = failure.code || 'ABORTED'
    throw error
  }
  return { text: text.trim(), finish, model: selection }
}

/**
 * 一次完整的模型调用：收集文本增量，返回文本与终止原因。
 * @param {object} ctx Cordis 宿主上下文
 * @param {{system: string, messages: object[], maxTokens?: number, temperature?: number,
 *          signal?: AbortSignal, effort?: string|null}} request
 */
export async function chat(ctx, request, config = {}) {
  const selection = await resolveSelection(ctx, config)
  return callSelected(ctx, selection, request, config)
}

function callSelected(ctx, selection, request, config) {
  if (selection.source === 'custom') return chatCustom(config.customApi, selection, request)
  const llm = ctx.get?.('llm')
  if (!llm || typeof llm.stream !== 'function') {
    throw new LlmUnavailableError('当前 Harness 组态里没有可用的 llm 服务')
  }
  return runChat(ctx, llm, selection, request, config)
}

/** 模型偶发只思考不作答：去掉 reasoningEffort、加大预算再要一次。 */
export async function chatWithRetry(ctx, request, config = {}, selected) {
  const selection = selected ?? await resolveSelection(ctx, config)
  const first = await callSelected(ctx, selection, request, config)
  if (first.text) return first
  const budget = Math.min(4000, Math.round((request.maxTokens ?? 1200) * 1.6))
  const second = await callSelected(ctx, selection, { ...request, effort: null, maxTokens: budget }, config)
  if (!second.text) throw new Error('模型没有返回内容，请稍后重试')
  return second
}

/** 去掉模型偶尔带出来的前缀。 */
export function cleanAnswer(text) {
  let out = String(text ?? '').trim()
  out = out.replace(/^(回答|答|答案)[:：]\s*/, '')
  out = out.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '')
  return out.trim()
}
