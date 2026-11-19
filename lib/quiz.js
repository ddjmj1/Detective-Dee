/**
 * 出题：随机抽台词块 -> 约束生成 -> 校验 -> 不合格时退化成“台词接龙”选择题。
 * 与 bot/question_gen.py 的思路一致：不建题库，只按当次要求生成。
 */
import { buildQuizMessages, extractJson, FORM_LABELS, SETTING_LABELS } from './prompts.js'
import { chatWithRetry } from './llm.js'

const FORMS = Object.keys(FORM_LABELS)
const SETTINGS = Object.keys(SETTING_LABELS)
const LETTERS = ['A', 'B', 'C', 'D']
const DIFFICULTIES = ['简单', '中档', '难度']

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function normalizeList(value, allowed, fallback) {
  if (!Array.isArray(value)) return fallback
  const out = value.filter((item) => allowed.includes(item))
  return out.length > 0 ? out : fallback
}

function compact(text) {
  return String(text ?? '').replace(/\s+/g, '')
}

function pickEvidenceLine(text, answer) {
  const lines = String(text ?? '').split('\n').filter((line) => line.trim())
  const needle = compact(answer)
  if (needle) {
    const hit = lines.find((line) => compact(line).includes(needle))
    if (hit) return hit.trim().slice(0, 160)
  }
  const dialogue = lines.find((line) => line.includes('】'))
  return (dialogue ?? lines[0] ?? '').trim().slice(0, 160)
}

/**
 * 校验并规整模型输出。
 * @returns {object|null}
 */
function normalizeQuestion(parsed, seed, form, setting) {
  if (!parsed || typeof parsed !== 'object') return null
  const question = String(parsed.question ?? '').trim().replace(/^题目[:：]\s*/, '')
  if (!question || question.length > 240) return null

  let answer = String(parsed.answer ?? '').trim()
  let options = {}
  let letter = ''

  if (form === 'choice') {
    const raw = parsed.options && typeof parsed.options === 'object' ? parsed.options : {}
    for (const key of LETTERS) {
      const value = String(raw[key] ?? raw[key.toLowerCase()] ?? '').trim()
      if (!value) return null
      options[key] = value.slice(0, 40)
    }
    const candidate = String(parsed.letter || parsed.answer || '').trim().toUpperCase().slice(0, 1)
    if (!LETTERS.includes(candidate)) return null
    letter = candidate
    answer = candidate
    if (new Set(Object.values(options)).size < 4) return null
  } else if (form === 'judge') {
    if (/^(对|正确|是|true|yes)/i.test(answer)) answer = '对'
    else if (/^(错|错误|否|false|no)/i.test(answer)) answer = '错'
    else return null
  } else {
    if (!answer) return null
    if (answer.length > 60) return null
  }

  if (form === 'quote') {
    if (!/[—]{2}|（\s*　*\s*）|\(\s*　*\s*\)/.test(question)) return null
    if (question.includes(answer) && answer.length >= 2) return null
  }
  if (form === 'open' && question.includes(answer) && answer.length >= 3) return null

  const evidenceRaw = String(parsed.evidence ?? '').trim()
  const evidenceOk =
    evidenceRaw.length >= 6 &&
    (compact(seed.text).includes(compact(evidenceRaw).slice(0, 40)) ||
      compact(evidenceRaw).includes(compact(question).slice(0, 12)))
  const evidence = evidenceOk ? evidenceRaw.slice(0, 300) : pickEvidenceLine(seed.text, answer)

  const aliases = Array.isArray(parsed.aliases)
    ? parsed.aliases.map((item) => String(item).trim()).filter((item) => item && item !== answer).slice(0, 4)
    : []
  const difficulty = DIFFICULTIES.includes(parsed.difficulty) ? parsed.difficulty : '中档'

  return {
    form,
    setting,
    question: question.slice(0, 200),
    answer,
    aliases,
    difficulty,
    evidence,
    explanation: String(parsed.explanation ?? '').trim().slice(0, 300),
    options,
    letter,
    case: seed.case,
    season: seed.season,
    scene: seed.scene,
    flash: seed.flash,
    verified: evidenceOk,
    fallback: false,
  }
}

/** 模型失败时的兜底：台词接龙单选题。 */
function fallbackQuestion(store, cases) {
  const pair = store.dialoguePair(cases)
  if (!pair) return null
  const options = {}
  const values = [pair.answer, ...pair.distractors]
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  let letter = 'A'
  values.forEach((value, index) => {
    options[LETTERS[index]] = value
    if (value === pair.answer) letter = LETTERS[index]
  })
  return {
    form: 'choice',
    setting: 'detail',
    question: `台词接龙：下面这句之后，紧接着的一句是——「${pair.prompt}」`,
    answer: letter,
    aliases: [],
    difficulty: '中档',
    evidence: pair.answer,
    explanation: `按台词原文顺序，下一句是「${pair.answer}」。`,
    options,
    letter,
    case: pair.case,
    season: pair.season,
    scene: '',
    flash: false,
    verified: true,
    fallback: true,
  }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * @param {import('./store.js').ShendiStore} store
 * @param {object} ctx
 * @param {object} config
 * @param {{cases?: string[], count?: number, forms?: string[], settings?: string[]}} options
 */
export async function generateQuiz(store, ctx, config, options = {}) {
  const started = Date.now()
  await store.ensure()
  const forms = normalizeList(options.forms, FORMS, ['choice'])
  const settings = normalizeList(options.settings, SETTINGS, ['detail'])
  const count = Math.max(1, Math.min(Number(options.count) || 3, 10))
  const cases = Array.isArray(options.cases) ? options.cases.filter((name) => store.caseSet.has(name)) : []

  const seeds = store.sampleSeeds({ cases, count })
  if (seeds.length === 0) throw new Error('没有可用的台词块，换几个案子试试')

  const items = await pool(seeds, 3, async (seed) => {
    const form = pick(forms)
    const setting = pick(settings)
    const beat = store.beats[seed.beat]
    const messages = buildQuizMessages({
      seed,
      beatSummary: beat?.summary ? String(beat.summary).slice(0, 260) : '',
      form,
      setting,
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.quizTimeoutMs ?? 90000)
    let reason = ''
    try {
      const result = await chatWithRetry(
        ctx,
        {
          system: messages[0].content,
          messages: [{ role: 'user', content: [{ type: 'text', text: messages[1].content }] }],
          maxTokens: config.quizMaxTokens ?? 1100,
          temperature: 0.6,
          // 出题只要能落成 JSON，不需要把预算烧在思考上
          effort: null,
          signal: controller.signal,
        },
        config,
      )
      const parsed = extractJson(result.text)
      if (!parsed) reason = '模型没有返回有效的题目 JSON。'
      const normalized = normalizeQuestion(parsed, seed, form, setting)
      if (normalized) return normalized
      if (!reason) reason = '模型生成的题目未通过校验。'
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error)
    } finally {
      clearTimeout(timeout)
    }
    const fallback = fallbackQuestion(store, cases)
    if (fallback) fallback.reason = reason
    return fallback
  })

  const seen = new Set()
  const final = []
  const diagnostics = []
  for (const item of items) {
    if (!item) continue
    if (item.reason) diagnostics.push(item.reason)
    if (seen.has(item.question)) continue
    seen.add(item.question)
    const { reason, ...rest } = item
    final.push(rest)
  }
  if (final.length === 0) throw new Error('这次没能出成题，再试一次')

  return {
    items: final,
    meta: {
      cases: cases.length > 0 ? cases : ['全部案件'],
      forms,
      settings,
      count: final.length,
      fallback: final.filter((item) => item.fallback).length,
      diagnostics: diagnostics.slice(0, 4),
      ms: Date.now() - started,
    },
  }
}
