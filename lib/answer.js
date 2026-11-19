/**
 * 剧情问答：检索 -> 编排 -> 模型综合。
 * 口径与 QQ 机器人 bot/features/qa.py 一致：证据为空时不调用模型，直接说没找到。
 */
import { buildQaMessages } from './prompts.js'
import { chatWithRetry, cleanAnswer, resolveSelection } from './llm.js'

const REFUSAL_EMPTY = '台词素材里没有找到和这个问题直接相关的内容。换个说法，或者告诉我是哪个案子、哪个人物？'

function excerpt(text, limit = 200) {
  const compact = String(text ?? '').replace(/\s*\n\s*/g, ' ／ ').trim()
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact
}

/**
 * @param {import('./store.js').ShendiStore} store
 * @param {object} ctx
 * @param {object} config
 * @param {{question: string, history?: {role: string, content: string}[]}} input
 */
export async function answerQuestion(store, ctx, config, input) {
  const started = Date.now()
  const question = String(input.question ?? '').trim().slice(0, 400)
  if (!question) throw new Error('问题不能为空')
  await store.ensure()

  const evidence = store.retrieve(question)

  const evidenceBrief = evidence.blocks.map((block) => ({
    case: block.case,
    season: block.season,
    scene: block.scene,
    flash: block.flash,
    excerpt: excerpt(block.text),
  }))
  const novelBrief = (evidence.novelNotes ?? []).map((note) => ({
    case: evidence.case ?? '',
    season: '小说',
    scene: evidence.novelOnly ? '小说独有' : '同场景补充',
    flash: false,
    excerpt: excerpt(note.replace(/^·(\[同场景\]\s*)?/, ''), 220),
  }))
  const meta = {
    intent: evidence.query.intent,
    case: evidence.case,
    entities: evidence.query.entities,
    nouns: evidence.query.nouns.map((entry) => entry.name),
    evidenceChars: evidence.evidenceChars,
    novelOnly: Boolean(evidence.novelOnly),
    novelNotes: (evidence.novelNotes ?? []).length,
  }

  const nothing =
    evidence.blocks.length === 0 &&
    (evidence.novelNotes ?? []).length === 0 &&
    !evidence.outline &&
    evidence.entityNotes.length === 0 &&
    evidence.nounCards.length === 0
  if (nothing) {
    return {
      answer: REFUSAL_EMPTY,
      evidence: [],
      meta: { ...meta, refused: true, ms: Date.now() - started },
    }
  }

  // “剧里一共有哪些案子”这类清点题直接用索引回答，避免全文扫描漏项
  if (
    evidence.query.intent === 'enumerate' &&
    evidence.query.cases.length === 0 &&
    /(案件|案子|哪几部|几部)/.test(question)
  ) {
    return {
      answer: store.caseOverview(),
      evidence: [],
      meta: { ...meta, fromIndex: true, ms: Date.now() - started },
    }
  }

  const selection = await resolveSelection(ctx, config)
  const sameRoute = input.historyRoute?.provider === selection.provider && input.historyRoute?.model === selection.model
  const history = sameRoute && Array.isArray(input.history) ? input.history.slice(-6) : []
  const messages = buildQaMessages(evidence, history)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs ?? 120000)
  let result
  try {
    result = await chatWithRetry(
      ctx,
      {
        system: messages[0].content,
        messages: [{ role: 'user', content: [{ type: 'text', text: messages[1].content }] }],
        maxTokens: config.maxAnswerTokens ?? 1500,
        temperature: 0.3,
        signal: controller.signal,
      },
      config,
      selection,
    )
  } finally {
    clearTimeout(timeout)
  }

  const answer = cleanAnswer(result.text)
  return {
    answer: answer || REFUSAL_EMPTY,
    evidence: [...evidenceBrief, ...novelBrief],
    meta: {
      ...meta,
      ms: Date.now() - started,
      provider: result.model?.provider,
      model: result.model?.model,
    },
  }
}
