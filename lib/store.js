/**
 * 台词素材的本地索引与检索。
 *
 * 只读 data 目录下的 JSON（corpus / plot / characters / nouns / novel），不读
 * config/config.json，也不接触任何密钥。索引全部建立在内存里：
 *  - 台词行（utterance）级：中文二元组倒排，用于 BM25 式召回；
 *  - 台词块（chunk）级：证据单元，带案件、场景、说话人、插叙标记；
 *  - 剧情层：案件梗概、剧情单元提要、人物档案、专名卡片；
 *  - 小说层（可选）：原著段落，只在台词定位之后做同场景补充，或走小说独有模式。
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { Novel, plain, lcsLength } from './novel.js'

const CJK = /[\u4e00-\u9fff]/

const OVERVIEW_WORDS = [
  '来龙去脉', '前因后果', '讲了什么', '讲的什么', '讲的是什么', '梗概', '整个案', '整案', '全案',
  '始末', '梳理', '总结', '概括', '主线', '全剧', '整部', '这部', '怎么破', '如何破', '破案过程',
  '查案过程', '案件经过', '结局如何', '最后怎么样',
]
const ENTITY_WORDS = [
  '是谁', '什么人', '身份', '来历', '背景', '介绍', '人物', '结局', '下场', '怎么样的人', '关系',
  '是不是', '真实身份', '身份是', '官职', '职位', '任何职', '做什么官', '任什么', '官居', '官拜',
]
const QUOTE_WORDS = ['原话', '台词', '怎么说的', '说了什么', '原句', '哪句']
const ENUMERATE_WORDS = [
  '所有', '哪些', '多少', '几个', '列举', '盘点', '分别', '一共', '全部', '出现过', '几次',
  '几处', '哪几处', '多少处', '都有谁', '谁还',
]
const COMPARE_WORDS = ['区别', '相似', '对比', '比较', '共同点', '异同', '不同之处', '哪个更', '谁更']
const FLASH_WORDS = ['回忆', '插叙', '倒叙', '闪回', '当年', '十年前', '以前', '往事', '回想']
const NOVEL_WORDS = ['小说', '原著']
const NOVEL_GENERIC = new Set([
  '什么', '哪些', '哪个', '怎么', '如何', '为什么', '是不是', '不是', '有没有', '关系', '人物', '角色',
  '故事', '剧情', '剧中', '台词', '小说', '原著', '这段', '这里', '这个', '那个', '他们', '我们', '你们',
  '后来', '最后', '结局', '到底', '究竟', '情节', '内容', '写过', '写的是',
])
const NOVEL_SINGLE_CHARS = new Set([...'怕猫刀剑毒药水车马船银钱人鬼神蛇鹰虎狼虫'])
const WHOLE_SHOW_WORDS = ['全剧', '整部', '这几部', '三部', '整个系列', '所有案件', '各个案件', '每个案子', '总体']

const CASE_ALIASES = {
  '邗沟': '漕渠魅影', '漕渠': '漕渠魅影', '覆船': '漕渠魅影', '盐船': '漕渠魅影', '盱眙': '漕渠魅影',
  '无头将军': '滴血雄鹰', '滴血': '滴血雄鹰',
  '蓝衫': '蓝衫记',
  '关河': '关河疑影', '崇州': '关河疑影',
  '蛇灵': '蛇灵',
  '江州': '血色江州',
  '黑衣社': '黑衣社', '凉州': '黑衣社',
  '金银': '金银奇案', '善金局': '金银奇案',
  '月氏': '杀人陷阱', '杀人陷阱': '杀人陷阱',
}

const SEASON_WORDS = {
  '第一部': '第一部', '第一季': '第一部', '1部': '第一部',
  '第二部': '第二部', '第二季': '第二部', '2部': '第二部',
  '第三部': '第三部', '第三季': '第三部', '3部': '第三部',
  '神断': '神断狄仁杰',
}

const MANUAL_ALIASES = {
  '狄公': '狄仁杰', '阁老': '狄仁杰', '老狄': '狄仁杰', '狄大人': '狄仁杰',
  '元芳': '李元芳', '李将军': '李元芳',
  '如燕': '狄如燕', '青霞': '李青霞', '武皇': '武则天', '圣上': '武则天', '陛下': '武则天',
  '金木兰': '李青霞', '郡主': '李青霞',
  '黑衣天王': '小桃', '天王': '小桃',
  '颖王': '元齐', '葛庄主': '葛天霸',
  '陈有龙': '吴大憨',
  '何夫人': '李紫君',
}

/** 中文相邻二字组（标点、数字、字母处断开）。 */
export function bigrams(text) {
  const out = new Set()
  let prev = ''
  for (const ch of text) {
    if (CJK.test(ch)) {
      if (prev) out.add(prev + ch)
      prev = ch
    } else {
      prev = ''
    }
  }
  return out
}

function clean(text) {
  return String(text ?? '').replace(/[\u200b\ufeff]/g, '').trim()
}

/** 空证据骨架：台词层与小说层共用。 */
function emptyEvidence(query) {
  return {
    query,
    case: query.cases[0] ?? null,
    outline: '',
    entityNotes: [],
    nounCards: [],
    truthNotes: [],
    existence: [],
    blocks: [],
    evidenceChars: 0,
    novelNotes: [],
    novelOnly: false,
    novelRequested: false,
    novelSubject: '',
    novelSubjectMissing: false,
    novelChecked: false,
  }
}

/** 没有台词、没有纲要、没有人物档案、没有名词卡、也没有小说：算空。 */
function isEmptyEvidence(evidence) {
  return (
    evidence.blocks.length === 0 &&
    !evidence.outline &&
    evidence.entityNotes.length === 0 &&
    evidence.nounCards.length === 0 &&
    evidence.novelNotes.length === 0
  )
}

/** 统一算一次证据体量（台词 + 小说）。 */
function finishEvidence(evidence) {
  const blocks = evidence.blocks.reduce((sum, block) => sum + block.text.length, 0)
  const novel = evidence.novelNotes.reduce((sum, note) => sum + note.length, 0)
  evidence.evidenceChars = blocks + novel
  return evidence
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8')
  return JSON.parse(raw)
}

function statSig(info) {
  return `${info.mtimeMs}:${info.size}`
}

export class ShendiStore {
  /**
   * @param {string} dataDir 四份 JSON 所在目录
   * @param {{maxEvidenceChars?: number, log?: (msg: string) => void}} [options]
   */
  constructor(dataDir, options = {}) {
    this.dataDir = path.resolve(dataDir)
    this.maxEvidenceChars = options.maxEvidenceChars ?? 5600
    this.log = options.log ?? (() => {})
    this.loading = null
    this.signature = ''
    this.ready = false
    this.entityCaseCache = new Map()
  }

  async ensure() {
    if (this.loading) return this.loading
    const files = {
      corpus: path.join(this.dataDir, 'corpus.json'),
      plot: path.join(this.dataDir, 'plot.json'),
      characters: path.join(this.dataDir, 'characters.json'),
      nouns: path.join(this.dataDir, 'nouns.json'),
    }
    const novelFile = path.join(this.dataDir, 'novel.json')
    const started = Date.now()
    this.loading = (async () => {
      try {
        const infos = await Promise.all(Object.values(files).map((file) => stat(file)))
        // 小说是可选层：没有 novel.json 时其余功能照旧
        const novelStat = await stat(novelFile).catch(() => null)
        const signature = `${Object.entries(files)
          .map(([key, file], i) => `${key}=${statSig(infos[i])}`)
          .join('|')}|novel=${novelStat ? statSig(novelStat) : 'none'}`
        if (this.ready && signature === this.signature) return this
        const [corpus, plot, characters, nouns, novel] = await Promise.all([
          readJson(files.corpus),
          readJson(files.plot),
          readJson(files.characters),
          readJson(files.nouns),
          novelStat ? readJson(novelFile).catch(() => null) : Promise.resolve(null),
        ])
        this.#build(corpus, plot, characters, nouns, novel)
        this.signature = signature
        this.ready = true
        const novelInfo = this.novel?.available ? `，小说 ${this.novel.docs.length} 段` : ''
        this.log(
          `台词索引已载入：${this.chunks.length} 块 / ${this.utterances.length} 行${novelInfo}，用时 ${Date.now() - started}ms`,
        )
        return this
      } finally {
        this.loading = null
      }
    })()
    return this.loading
  }

  // ------------------------------------------------------------------ 建索引
  #build(corpus, plot, characters, nouns, novelPayload = null) {
    this.corpus = corpus
    this.plot = plot
    this.characters = characters
    this.nouns = nouns
    this.novel = new Novel(novelPayload)

    this.utterances = Array.isArray(corpus.utterances) ? corpus.utterances : []
    this.chunks = Array.isArray(corpus.chunks) ? corpus.chunks : []
    this.pairs = Array.isArray(corpus.pairs) ? corpus.pairs : []

    const nUtt = this.utterances.length
    this.chunkOfUtt = new Int32Array(nUtt).fill(-1)
    for (let ci = 0; ci < this.chunks.length; ci += 1) {
      const chunk = this.chunks[ci]
      const start = Number.isInteger(chunk.start) ? chunk.start : -1
      const end = Number.isInteger(chunk.end) ? chunk.end : -1
      if (start < 0 || end < start) continue
      for (let i = start; i <= end && i < nUtt; i += 1) this.chunkOfUtt[i] = ci
    }

    // 台词行级二元组倒排
    const postings = new Map()
    const uttLen = new Int32Array(nUtt)
    for (let i = 0; i < nUtt; i += 1) {
      const text = clean(this.utterances[i].text)
      uttLen[i] = Math.max(1, text.length)
      for (const token of bigrams(text)) {
        let list = postings.get(token)
        if (list === undefined) {
          list = []
          postings.set(token, list)
        }
        list.push(i)
      }
    }
    this.postings = postings
    this.uttLen = uttLen

    // 人物名 -> 规范名（含别名、手工俗称）
    const nameMap = new Map()
    const addName = (surface, canon) => {
      const key = clean(surface)
      if (key.length < 2) return
      let set = nameMap.get(key)
      if (set === undefined) {
        set = new Set()
        nameMap.set(key, set)
      }
      set.add(canon)
    }
    for (const item of characters.characters ?? []) {
      const canon = clean(item.name)
      if (!canon) continue
      addName(canon, canon)
      if (item.base && item.base !== item.name) addName(item.base, canon)
      for (const alias of item.aliases ?? []) addName(alias, canon)
    }
    for (const [surface, targets] of Object.entries(characters.alias_index ?? {})) {
      for (const target of targets ?? []) addName(surface, target)
    }
    for (const [surface, canon] of Object.entries(MANUAL_ALIASES)) addName(surface, canon)
    this.nameSurfaces = [...nameMap.keys()].sort((a, b) => b.length - a.length)
    this.nameMap = nameMap
    this.aliasByCanon = new Map()
    for (const [surface, canons] of nameMap) {
      for (const canon of canons) {
        const list = this.aliasByCanon.get(canon)
        if (list === undefined) this.aliasByCanon.set(canon, [surface])
        else if (!list.includes(surface)) list.push(surface)
      }
    }
    this.characterByName = new Map()
    for (const item of characters.characters ?? []) {
      const canon = clean(item.name)
      if (canon && !this.characterByName.has(canon)) this.characterByName.set(canon, item)
    }
    this.ambiguous = characters.ambiguous ?? {}

    // 专名（名词卡）
    const nounMap = new Map()
    for (const entry of nouns.entries ?? []) {
      if (entry.retrieval === false) continue
      const name = clean(entry.name)
      if (!name) continue
      if (!nounMap.has(name)) nounMap.set(name, [])
      nounMap.get(name).push(entry)
      for (const alias of entry.aliases ?? []) {
        const key = clean(alias)
        if (key.length < 2) continue
        if (!nounMap.has(key)) nounMap.set(key, [])
        nounMap.get(key).push(entry)
      }
    }
    this.nounMap = nounMap
    this.nounSurfaces = [...nounMap.keys()].sort((a, b) => b.length - a.length)

    // 案件与部数
    this.caseNames = Object.keys(plot.cases ?? {})
    this.caseSet = new Set(this.caseNames)
    const bySeason = new Map()
    for (const [name, meta] of Object.entries(plot.cases ?? {})) {
      const season = meta.season ?? ''
      if (!bySeason.has(season)) bySeason.set(season, [])
      bySeason.get(season).push(name)
    }
    this.casesBySeason = bySeason

    this.chunkByCid = new Map()
    for (let ci = 0; ci < this.chunks.length; ci += 1) this.chunkByCid.set(this.chunks[ci].cid, ci)

    // 素材开头的书名、作者、整理人这类页眉不是剧情，检索和出题都跳过。
    this.junkChunks = new Set()
    for (let ci = 0; ci < this.chunks.length; ci += 1) {
      const head = clean(this.chunks[ci].text).slice(0, 120)
      if (/台词汇编|作者[:：]|整理编辑|台词摘录|校对版/.test(head)) this.junkChunks.add(ci)
    }

    this.beats = plot.beats ?? {}
  }

  // ------------------------------------------------------------------ 元信息
  get stats() {
    return {
      chunks: this.chunks.length,
      utterances: this.utterances.length,
      beats: Object.keys(this.beats).length,
      cases: this.caseNames.length,
      characters: this.characters.count ?? (this.characters.characters ?? []).length,
      nouns: this.nouns.count ?? (this.nouns.entries ?? []).length,
      novel: this.novel ? this.novel.stats() : { available: false },
      casesBySeason: Object.fromEntries([...this.casesBySeason].map(([k, v]) => [k, v.length])),
    }
  }

  get caseList() {
    return this.caseNames.map((name) => {
      const meta = this.plot.cases[name] ?? {}
      return {
        name,
        season: meta.season ?? '',
        brief: meta.brief ?? '',
        chunks: meta.chunks ?? 0,
        characters: (meta.characters ?? []).slice(0, 12),
      }
    })
  }

  // ------------------------------------------------------------------ 查询理解
  /**
   * 把问题拆成 意图 / 人物 / 专名 / 案件 / 部数。
   * @param {string} raw
   */
  analyze(raw) {
    const question = clean(raw)
    const used = new Array(question.length).fill(false)
    const take = (surface) => {
      let from = 0
      let hit = -1
      for (;;) {
        const at = question.indexOf(surface, from)
        if (at < 0) return hit
        let free = true
        for (let i = at; i < at + surface.length; i += 1) {
          if (used[i]) {
            free = false
            break
          }
        }
        if (free) {
          for (let i = at; i < at + surface.length; i += 1) used[i] = true
          if (hit < 0) hit = at
          return hit
        }
        from = at + 1
      }
    }

    const entities = []
    for (const surface of this.nameSurfaces) {
      if (!question.includes(surface)) continue
      if (take(surface) < 0) continue
      for (const canon of this.nameMap.get(surface) ?? []) {
        if (!entities.includes(canon)) entities.push(canon)
      }
      if (entities.length >= 6) break
    }

    const nouns = []
    for (const surface of this.nounSurfaces) {
      if (!question.includes(surface)) continue
      if (entities.includes(surface)) continue
      if (take(surface) < 0) continue
      const entries = this.nounMap.get(surface) ?? []
      for (const entry of entries) {
        if (!nouns.some((item) => item.id === entry.id)) nouns.push(entry)
      }
      if (nouns.length >= 4) break
    }

    const cases = []
    for (const name of this.caseNames) {
      if (question.includes(name) && take(name) >= 0) cases.push(name)
    }
    for (const [alias, name] of Object.entries(CASE_ALIASES)) {
      if (!this.caseSet.has(name)) continue
      if (question.includes(alias) && take(alias) >= 0 && !cases.includes(name)) cases.push(name)
    }

    const seasons = []
    for (const [word, season] of Object.entries(SEASON_WORDS)) {
      if (season && question.includes(word) && take(word) >= 0 && !seasons.includes(season)) seasons.push(season)
    }

    const has = (list) => list.some((word) => question.includes(word))
    let intent = 'detail'
    if (has(COMPARE_WORDS)) intent = 'compare'
    else if (has(OVERVIEW_WORDS)) intent = 'overview'
    else if (has(ENUMERATE_WORDS)) intent = 'enumerate'
    else if (has(QUOTE_WORDS)) intent = 'quote'
    else if (entities.length > 0 && has(ENTITY_WORDS)) intent = 'entity'

    const asksNovel = has(NOVEL_WORDS)
    const novelOnlyNames = this.#novelOnlyNames(question)
    if (asksNovel) intent = 'detail'

    return {
      raw: question,
      intent,
      entities,
      nouns,
      cases,
      seasons,
      wholeShow: has(WHOLE_SHOW_WORDS),
      asksFlash: has(FLASH_WORDS),
      asksNovel,
      novelOnlyNames,
    }
  }

  /** 问题里“人物库没有、台词里也没有、只在小说里出现”的人名。 */
  #novelOnlyNames(question) {
    if (!this.novel?.available) return []
    const out = []
    for (const name of this.#candidateNames(question)) {
      if (this.characterByName.has(name) || this.nameMap.has(name)) continue
      if (this.exists(name)) continue
      if (!this.novel.contains(name)) continue
      if (!out.includes(name)) out.push(name)
    }
    return out.slice(0, 4)
  }

  /** 从问句里抽“可能是人名”的候选，只用于判断是不是小说独有。 */
  #candidateNames(question) {
    const names = []
    const cleanName = (value) => {
      let name = clean(value)
      // “小说里李化文……”这类前缀会被一起截进来，去掉后再试
      for (const prefix of ['小说里', '小说中', '原著里', '原著中', '小说', '原著', '书里', '书中', '里', '中', '的']) {
        if (name.startsWith(prefix) && name.length - prefix.length >= 2) {
          name = name.slice(prefix.length)
          break
        }
      }
      return name
    }
    const push = (value) => {
      let name = cleanName(value)
      if (name.length > 4) {
        // 前面多半混进了“小说里/书中”之类的噪声，按后缀切一个小说里确有的名字
        for (let len = 4; len >= 2; len -= 1) {
          const candidate = name.slice(-len)
          if (this.novel?.contains(candidate) && !this.exists(candidate)) {
            name = candidate
            break
          }
        }
      }
      if (name.length >= 2 && name.length <= 4 && CJK.test(name[0]) && !names.includes(name)) names.push(name)
    }
    const suffix =
      '(?:是谁|是什么人|是个什么人|是什么样的人|是个什么样的人|是何人|什么人|是不是|算不算|是什么身份|的身份|的结局|结局如何|最后怎么样|最后如何|怎么死的|怎么被杀|被谁杀)'
    const patterns = [
      new RegExp(`([\\u4e00-\\u9fa5]{2,4}?)${suffix}`, 'g'),
      /([\u4e00-\u9fa5]{2,5}?)(?:和|与)([\u4e00-\u9fa5]{2,5}?)(?:是什么关系|什么关系|的关系)/g,
      /^([\u4e00-\u9fa5]{2,5}?)(?:是小说|是原著)/g,
    ]
    for (const pattern of patterns) {
      for (const match of question.matchAll(pattern)) {
        push(match[1])
        if (match[2]) push(match[2])
      }
    }
    return names
  }

  // ------------------------------------------------------------------ 召回
  #utteranceScores(question) {
    const scores = new Float32Array(this.utterances.length)
    const n = this.utterances.length || 1
    for (const token of bigrams(question)) {
      const list = this.postings.get(token)
      if (list === undefined || list.length === 0) continue
      const idf = Math.log((n + 1) / (list.length + 0.5))
      if (idf <= 0) continue
      for (let k = 0; k < list.length; k += 1) scores[list[k]] += idf
    }
    for (let i = 0; i < scores.length; i += 1) {
      if (scores[i] > 0) scores[i] /= Math.sqrt(this.uttLen[i] / 12)
    }
    return scores
  }

  #rankChunks(question) {
    const scores = this.#utteranceScores(question)
    const n = this.chunks.length
    const b1 = new Float32Array(n)
    const b2 = new Float32Array(n)
    const b3 = new Float32Array(n)
    for (let i = 0; i < scores.length; i += 1) {
      const s = scores[i]
      if (s <= 0.01) continue
      const ci = this.chunkOfUtt[i]
      if (ci < 0) continue
      if (s > b1[ci]) {
        b3[ci] = b2[ci]
        b2[ci] = b1[ci]
        b1[ci] = s
      } else if (s > b2[ci]) {
        b3[ci] = b2[ci]
        b2[ci] = s
      } else if (s > b3[ci]) {
        b3[ci] = s
      }
    }
    const ranked = []
    for (let ci = 0; ci < n; ci += 1) {
      if (this.junkChunks.has(ci)) continue
      const score = b1[ci] + 0.5 * b2[ci] + 0.25 * b3[ci]
      if (score > 0) ranked.push([ci, score])
    }
    ranked.sort((a, b) => b[1] - a[1])
    return ranked
  }

  /**
   * 词面覆盖用的词：人物名、专名，加上问题里足够“稀有”的双字组合。
   * 这一步只保证“问题里点到的词确实在同一段里出现”，用来压掉只靠一个
   * 常见词命中的噪声块。
   */
  #coverageTerms(query) {
    const terms = []
    const add = (term) => {
      if (term && !terms.includes(term)) terms.push(term)
    }
    for (const name of query.entities) add(name)
    for (const entry of query.nouns) add(entry.name)
    const rare = this.utterances.length * 0.02
    for (const token of bigrams(query.raw)) {
      if (terms.length >= 14) break
      const list = this.postings.get(token)
      if (list === undefined) continue
      if (list.length > rare) continue
      add(token)
    }
    return terms
  }

  /** 某个人物在哪些案件出现（台词块计数）。 */
  entityCaseCounts(name, limit = 999) {
    const cached = this.entityCaseCache.get(name)
    if (cached) return cached
    const counts = new Map()
    let total = 0
    for (const chunk of this.chunks) {
      if (!chunk.text || !chunk.text.includes(name)) continue
      total += 1
      if (total > limit * 8) break
      counts.set(chunk.case, (counts.get(chunk.case) ?? 0) + 1)
    }
    const result = { total, counts }
    this.entityCaseCache.set(name, result)
    return result
  }

  /** 台词里是否真的出现这段文字（允许标点空白差异）。 */
  exists(text) {
    const needle = clean(text).replace(/\s+/g, '')
    if (needle.length < 2) return false
    const tokens = [...bigrams(needle)]
    if (tokens.length === 0) return false
    let best = null
    for (const token of tokens) {
      const list = this.postings.get(token)
      if (list === undefined || list.length === 0) return false
      if (best === null || list.length < best.length) best = list
    }
    for (let k = 0; k < best.length; k += 1) {
      const utt = this.utterances[best[k]]
      if (clean(utt.text).replace(/\s+/g, '').includes(needle)) return true
    }
    return false
  }

  // ------------------------------------------------------------------ 证据编排
  /**
   * 组装一次问答需要的全部证据（台词层 + 可选的小说层）。
   * @param {string} raw
   */
  retrieve(raw) {
    const query = this.analyze(raw)

    // 用户明确问小说/原著：跳过台词首轮，只给小说
    if (query.asksNovel) {
      const evidence = emptyEvidence(query)
      this.#novelOnly(query, evidence, query.novelOnlyNames.length > 0)
      return finishEvidence(evidence)
    }

    const evidence = this.#retrieveDialogue(query)

    if (query.novelOnlyNames.length > 0) {
      // 首轮已经查过台词/人物/专名；确认没有该人物后，再切小说独有模式
      const only = emptyEvidence(query)
      this.#novelOnly(query, only, true)
      return finishEvidence(only)
    }
    if (isEmptyEvidence(evidence)) {
      // 台词/人物/专名都没有记录：第二轮回退到小说独有模式
      this.#novelOnly(query, evidence, query.entities.length === 0)
    } else if (this.#needsNovelOnly(query, evidence)) {
      const only = emptyEvidence(query)
      this.#novelOnly(query, only, false)
      return finishEvidence(only)
    } else {
      this.#addAlignedNovel(query, evidence)
    }
    return finishEvidence(evidence)
  }

  #retrieveDialogue(query) {
    const ranked = this.#rankChunks(query.raw)

    const boost = new Map()
    const addBoost = (ci, value) => boost.set(ci, (boost.get(ci) ?? 0) + value)

    // 人物：补该人物出场最多的块，避免只靠字面相似
    const entityNotes = []
    for (const name of query.entities.slice(0, 3)) {
      const profile = this.characterByName.get(name)
      if (profile) {
        const intro = clean(profile.intro)
        entityNotes.push(
          `·${name}（首次出场：${profile.case || '未注明'}）${intro ? `：${intro.slice(0, 300)}` : ''}`,
        )
      }
      const ambiguous = this.ambiguous[name]
      if (Array.isArray(ambiguous) && ambiguous.length > 0) {
        entityNotes.push(`·「${name}」在剧里指多个人：${ambiguous.join('、')}，要按案件分清，不要合成一个人。`)
      }
      const { counts } = this.entityCaseCounts(name)
      if (counts.size > 0) {
        const listed = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([cs, count]) => `${cs}（${count} 块）`)
          .join('、')
        entityNotes.push(`·台词出场分布：${listed}。`)
      }
      let added = 0
      for (const chunk of this.chunks) {
        if (added >= 3) break
        if (!chunk.text || !chunk.text.includes(name)) continue
        const ci = this.chunkByCid.get(chunk.cid)
        if (ci === undefined) continue
        addBoost(ci, 2.4)
        added += 1
      }
    }

    // 两个以上人名同时出现的块，最可能是问的那场戏（如“狄仁杰为什么审周二”）
    if (query.entities.length >= 2) {
      const names = query.entities.slice(0, 4)
      for (let ci = 0; ci < this.chunks.length; ci += 1) {
        const text = this.chunks[ci].text ?? ''
        let hits = 0
        for (const name of names) if (text.includes(name)) hits += 1
        if (hits >= 2) addBoost(ci, 3.2 + hits)
      }
    }

    // 专名：词条出处那一段强制带上
    const nounCards = []
    for (const entry of query.nouns.slice(0, 3)) {
      const category = clean(entry.category)
      const definition = clean(entry.definition)
      const quote = clean(entry.quote)
      nounCards.push(
        `·${entry.name}${category ? `（${category}` : '（'}${
          entry.case ? `｜首次见于${entry.case}` : ''
        }）${definition ? `：${definition}` : ''}${quote ? `｜台词出处：「${quote}」` : ''}`,
      )
      const ci = entry.chunk ? this.chunkByCid.get(entry.chunk) : undefined
      if (ci !== undefined) addBoost(ci, 3)
    }

    // 案件：问题点名案子时，优先该案
    const focusCase = query.cases[0] ?? null
    if (focusCase) {
      for (let ci = 0; ci < this.chunks.length; ci += 1) {
        if (this.chunks[ci].case === focusCase) addBoost(ci, 0.35)
      }
    }

    const coverageTerms = this.#coverageTerms(query)
    const merged = ranked.map(([ci, score]) => [ci, score + (boost.get(ci) ?? 0)])
    merged.sort((a, b) => b[1] - a[1])
    // 只在 BM25 前 400 块里算词面覆盖，避免每次整库扫描
    for (let i = 0; i < Math.min(400, merged.length); i += 1) {
      const text = this.chunks[merged[i][0]].text ?? ''
      let coverage = 0
      for (const term of coverageTerms) if (text.includes(term)) coverage += 1
      merged[i][1] += coverage * 2.6
    }
    merged.sort((a, b) => b[1] - a[1])

    const picked = []
    const pickedCids = new Set()
    const pushChunk = (ci, score, group = 0) => {
      const chunk = this.chunks[ci]
      if (!chunk || pickedCids.has(chunk.cid) || this.junkChunks.has(ci)) return
      pickedCids.add(chunk.cid)
      picked.push({ chunk, score, group })
    }

    // 案件内聚：先取命中最多案件的前若干块，再用跨案块补足，避免把整段串到别的案子里
    const nounCase =
      query.nouns[0]?.case && this.caseSet.has(query.nouns[0].case) ? query.nouns[0].case : null
    const caseCounts = new Map()
    for (const [ci] of merged.slice(0, 12)) {
      const cs = this.chunks[ci].case
      caseCounts.set(cs, (caseCounts.get(cs) ?? 0) + 1)
    }
    const dominant =
      focusCase ?? nounCase ?? [...caseCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const topScore = merged[0]?.[1] ?? 0
    const sameCase = []
    const crossCase = []
    for (const [ci, score] of merged) {
      if (score <= 0) break
      if (score < topScore * 0.08) break
      if (this.chunks[ci].case === dominant) sameCase.push([ci, score])
      else crossCase.push([ci, score])
    }
    // 同一案件按分数最多取 6 段；跨案块只保留和榜首同一量级的，避免噪声
    for (const [ci, score] of sameCase) {
      if (picked.length >= 6) break
      if (score < topScore * 0.1) continue
      pushChunk(ci, score, 0)
    }
    for (const [ci, score] of crossCase) {
      if (picked.length >= 8) break
      if (score < topScore * 0.35) continue
      pushChunk(ci, score, 1)
    }
    // 名词卡的出处段必须有，而且放在最前面（它是这个词最直接的证据）
    for (const entry of query.nouns.slice(0, 2)) {
      const ci = entry.chunk ? this.chunkByCid.get(entry.chunk) : undefined
      if (ci !== undefined && picked.length < 9) pushChunk(ci, 1, -1)
    }

    // 证据块：主案件按剧情顺序排，跨案补充放最后，超长时围绕命中词裁剪
    picked.sort((a, b) => a.group - b.group || (a.chunk.ord ?? 0) - (b.chunk.ord ?? 0))
    const terms = [...query.entities, ...query.nouns.map((entry) => entry.name)]
    const blocks = []
    let budget = this.maxEvidenceChars
    for (const { chunk } of picked) {
      if (budget <= 320) break
      const text = this.#trimChunk(chunk, terms, Math.min(1500, budget))
      if (!text) continue
      budget -= text.length
      blocks.push({
        cid: chunk.cid,
        case: chunk.case,
        season: chunk.season,
        scene: chunk.scene || '',
        flash: Boolean(chunk.flash),
        speakerCount: (chunk.speakers ?? []).length,
        text,
      })
    }

    // 案件 / 剧情单元
    const caseFromChunks = new Map()
    for (const block of blocks) caseFromChunks.set(block.case, (caseFromChunks.get(block.case) ?? 0) + 1)
    const resolvedCase =
      focusCase ??
      nounCase ??
      [...caseFromChunks.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)[0] ??
      query.seasons.map((season) => [...(this.casesBySeason.get(season) ?? [])]).flat()[0] ??
      null

    let outline = ''
    if (query.intent === 'overview' || query.wholeShow) {
      if (query.wholeShow || (!resolvedCase && this.caseNames.length > 0)) {
        const lines = []
        for (const [season, names] of this.casesBySeason) {
          const items = names.map((name) => {
            const meta = this.plot.cases[name] ?? {}
            return `《${name}》${clean(meta.brief) || clean(meta.summary).split('。')[0] || ''}`
          })
          if (items.length > 0) lines.push(`${season}：${items.join('；')}。`)
        }
        outline = `全剧共 ${this.caseNames.length} 个案子：\n${lines.join('\n')}`
      } else if (resolvedCase) {
        const meta = this.plot.cases[resolvedCase] ?? {}
        outline = `《${resolvedCase}》（${meta.season ?? ''}）\n${clean(meta.summary).slice(0, 1400)}`
      }
    } else if (resolvedCase) {
      const meta = this.plot.cases[resolvedCase] ?? {}
      outline = `《${resolvedCase}》（${meta.season ?? ''}）一句话：${clean(meta.brief)}`
    }

    const beatIds = []
    for (const { chunk } of picked) {
      if (chunk.beat && !beatIds.includes(chunk.beat)) beatIds.push(chunk.beat)
      if (beatIds.length >= 4) break
    }
    const truthNotes = []
    for (const bid of beatIds) {
      const beat = this.beats[bid]
      if (!beat?.summary) continue
      truthNotes.push(`·${beat.title ? `【${beat.title}】` : ''}${clean(beat.summary).slice(0, 260)}`)
    }

    // 台词存在性核对：引号里的原话
    const quoted = [...query.raw.matchAll(/[「“"]([^」”"]{2,18})[」”"]/g)].map((m) => m[1])
    const existence = []
    for (const text of quoted.slice(0, 3)) {
      if (this.exists(text)) existence.push(text)
    }

    return {
      ...emptyEvidence(query),
      case: resolvedCase,
      outline,
      entityNotes,
      nounCards,
      truthNotes,
      existence,
      blocks,
    }
  }

  // ------------------------------------------------------------------ 小说补充层
  /** 小说检索用的问题实词：人名、关键词，再补“猫/刀”这类单字实词。 */
  #novelTerms(query) {
    const terms = [...query.entities]
    const add = (term) => {
      if (term && !terms.includes(term)) terms.push(term)
    }
    for (const term of this.#coverageTerms(query)) {
      if (term.length >= 2 && !NOVEL_GENERIC.has(term)) add(term)
    }
    for (const action of ['打', '杀', '交手', '战斗', '刺杀', '劈', '刺', '砍']) {
      if (query.raw.includes(action)) add(action)
    }
    for (const ch of query.raw) {
      if (NOVEL_SINGLE_CHARS.has(ch)) add(ch)
    }
    return terms
  }

  /** 每个人名的同族称呼（含别名、俗称），用于“所有人物都必须出现在同一段”的校验。 */
  #entityGroups(query) {
    return query.entities.map((name) => new Set([name, ...(this.aliasByCanon.get(name) ?? [])]))
  }

  /** 小说独有模式：只给小说证据，不混台词/人物/专名。 */
  #novelOnly(query, evidence, subjectMissing = false) {
    evidence.novelOnly = true
    evidence.novelRequested = Boolean(query.asksNovel)
    evidence.novelSubjectMissing = Boolean(subjectMissing)
    evidence.novelChecked = true
    const names = [...new Set([...query.novelOnlyNames, ...query.entities])]
    evidence.novelSubject = names.join('、')
    if (!this.novel?.available) return

    const extras = names.flatMap((name) => this.aliasByCanon.get(name) ?? [])
    const terms = [...new Set([...names, ...this.#novelTerms(query).slice(0, 8), ...extras])]
    const focusCase = query.cases[0] ?? null
    const queryTerms =
      names.length > 0 ? [...names, ...terms.filter((term) => !names.includes(term)).slice(0, 4)] : [query.raw]
    // 先只用“人名/主体”检索：加了泛词之后，人名段会被常见词的分数盖掉
    let hits = names.length > 0 ? this.novel.search(names, { k: 12, caseName: focusCase }) : []
    if (hits.length === 0 && focusCase) hits = this.novel.search(names, { k: 12 })
    if (hits.length === 0) {
      hits = this.novel.search(queryTerms, { k: 12, caseName: focusCase })
      if (hits.length === 0 && focusCase) hits = this.novel.search(queryTerms, { k: 12 })
    }

    const groups = names.map((name) => new Set([name, ...(this.aliasByCanon.get(name) ?? [])]))
    const collect = (requireAll) => {
      let used = 0
      for (const [, doc] of hits) {
        const docs = this.novel.windowDocs(doc, 1, 2, 1000)
        let text = docs.map((item) => item.text).join('\n')
        if (groups.length > 0) {
          const present = groups.filter((group) => [...group].some((name) => text.includes(name))).length
          if (requireAll ? present !== groups.length : present === 0) continue
        }
        const label = this.novel.label(doc)
        const room = 1800 - used - label.length - 4
        if (room < 100) break
        if (text.length > room) text = `${text.slice(0, room).replace(/[，。；、\s]+$/u, '')}…`
        evidence.novelNotes.push(`·${label}：${text}`)
        used += text.length + label.length + 4
        if (evidence.novelNotes.length >= 4) break
      }
    }
    collect(true)
    // 两个人名的关系题，同段里往往只出现一个：放宽到“至少出现一个”，别把证据全丢掉
    if (evidence.novelNotes.length === 0 && groups.length > 1) collect(false)
  }

  /** 台词已经定位后，只补“同一场景”的小说动作/心理/表情。 */
  #addAlignedNovel(query, evidence) {
    if (!this.novel?.available || evidence.blocks.length === 0) return
    if (query.nouns.length > 0) {
      const definitional = ['是什么', '什么意思', '在哪', '出处', '谁说的', '干什么', '做什么', '属于'].some((k) =>
        query.raw.includes(k),
      )
      if (definitional) return
    }
    if (['quote', 'enumerate', 'overview', 'compare'].includes(query.intent)) return
    if (query.intent === 'entity' && ['是谁', '是什么人', '身份'].some((k) => query.raw.includes(k))) return
    if (['哪来的', '怎么来的', '谁给的', '来历', '身世'].some((k) => query.raw.includes(k))) return

    const terms = [
      ...new Set([
        ...this.#novelTerms(query),
        ...query.entities.flatMap((name) => this.aliasByCanon.get(name) ?? []),
      ]),
    ].slice(0, 10)
    if (terms.length === 0) return

    const groups = this.#entityGroups(query)
    const whyQ = ['为什么', '为何', '原因', '缘故'].some((k) => query.raw.includes(k))
    const causal = ['因为', '由于', '所以', '因此', '获罪', '诬陷', '贬', '怕', '担心', '为了', '缘故', '原因']
    const actionQ = ['打', '杀', '交手', '战斗', '刺杀'].some((k) => query.raw.includes(k))
    const actionMarks = ['打', '杀', '劈', '刺', '砍', '刀', '剑', '拳', '脚', '血']

    let used = 0
    const seen = new Set()
    for (const block of evidence.blocks.slice(0, 3)) {
      let aligned = this.novel.align(block.text, { caseName: block.case || null, terms })
      if (aligned.length === 0) {
        // “为什么”只认原句对齐；关键词回退很容易把别的“因为”段落拉进来
        if (whyQ) continue
        if (groups.length === 0) continue
        const fallback = this.novel.search(terms, { k: 6, caseName: block.case || null })
        for (const [, doc] of fallback) {
          const text = doc.text
          if (!groups.every((group) => [...group].some((name) => text.includes(name)))) continue
          if (whyQ && !causal.some((k) => text.includes(k))) continue
          if (actionQ && !actionMarks.some((k) => text.includes(k))) continue
          aligned = [[0, 0, doc]]
          break
        }
      }
      if (aligned.length === 0) continue

      let chosen = null
      for (const [, , candidate] of aligned) {
        if (seen.has(candidate.pid)) continue
        const docs = this.novel.windowDocs(candidate, 1, 2, 900)
        const text = docs.map((item) => item.text).join('\n')
        // 只补有叙述/动作/心理的段落；纯对白没有额外价值
        const hasNarration = docs.some((item) => !item.dialogue)
        const hasAction = ['刀', '剑', '拳', '脚', '劈', '刺', '砍', '血', '痛', '惊', '泪', '心', '笑'].some((k) =>
          text.includes(k),
        )
        if (!hasNarration && !hasAction) continue
        if (actionQ && !actionMarks.some((k) => text.includes(k))) continue
        if (groups.length > 0 && !groups.every((group) => [...group].some((name) => text.includes(name)))) continue
        if (whyQ && !causal.some((k) => text.includes(k))) continue
        const contentTerms = terms.filter((term) => !query.entities.includes(term))
        if (whyQ && contentTerms.length > 0 && !contentTerms.some((term) => text.includes(term))) continue
        chosen = { candidate, text }
        break
      }
      if (chosen === null) continue

      const label = this.novel.label(chosen.candidate)
      const room = 1300 - used - label.length - 10
      if (room < 120) break
      let text = chosen.text
      if (text.length > room) text = `${text.slice(0, room).replace(/[，。；、\s]+$/u, '')}…`
      evidence.novelNotes.push(`·[同场景] ${label}：${text}`)
      used += text.length + label.length + 10
      seen.add(chosen.candidate.pid)
      if (evidence.novelNotes.length >= 2) break
    }
  }

  /** 台词没有具体动作/关键物时，判断这段细节是不是只在小说里。 */
  #needsNovelOnly(query, evidence) {
    if (!this.novel?.available) return false
    if (['quote', 'enumerate', 'overview', 'compare'].includes(query.intent)) return false
    if (query.entities.length === 0 || evidence.blocks.length === 0) return false
    if (evidence.entityNotes.length > 0 && query.intent === 'entity') return false
    const focusCase = query.cases[0] ?? null

    const content = this.#novelTerms(query)
      .filter((term) => !query.entities.includes(term) && term.length >= 1 && !NOVEL_GENERIC.has(term))
      .slice(0, 5)
    if (content.length > 0 && !evidence.blocks.some((block) => content.some((term) => block.text.includes(term)))) {
      const hits = this.novel.search([...query.entities, ...content], { k: 8, caseName: focusCase })
      for (const [, doc] of hits) {
        if (
          query.entities.every((name) => doc.text.includes(name)) &&
          content.some((term) => doc.text.includes(term))
        ) {
          return true
        }
      }
    }

    const actionQ = ['怎么死', '怎么杀', '如何死', '怎么打', '怎么逃', '结局', '下场'].some((k) =>
      query.raw.includes(k),
    )
    if (!actionQ) return false
    const actions = ['死', '杀', '尸', '遇害', '被害', '刺', '砍', '打', '逃', '擒', '救', '毒']
    for (const block of evidence.blocks) {
      for (const sentence of block.text.split(/[。！？\n]/)) {
        if (query.entities.some((name) => sentence.includes(name)) && actions.some((a) => sentence.includes(a))) {
          return false
        }
      }
    }
    const hits = this.novel.search([...query.entities, ...actions.slice(0, 4)], { k: 6, caseName: focusCase })
    return hits.some(([, doc]) => query.entities.every((name) => doc.text.includes(name)))
  }

  #trimChunk(chunk, terms, maxChars) {
    const text = clean(chunk.text)
    if (!text) return ''
    if (text.length <= maxChars) return text
    const lines = text.split('\n')
    let best = 0
    let bestHits = -1
    for (let i = 0; i < lines.length; i += 1) {
      let hits = 0
      for (const term of terms) if (term && lines[i].includes(term)) hits += 1
      if (hits > bestHits) {
        bestHits = hits
        best = i
      }
    }
    let start = Math.max(0, best - 4)
    let end = Math.min(lines.length, best + 5)
    let out = lines.slice(start, end).join('\n')
    while (out.length < maxChars * 0.7 && (end < lines.length || start > 0)) {
      if (end < lines.length) {
        out += `\n${lines[end]}`
        end += 1
      } else if (start > 0) {
        start -= 1
        out = `${lines[start]}\n${out}`
      }
    }
    return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out
  }

  // ------------------------------------------------------------------ 出题素材
  /**
   * 随机抽取用于出题的台词块。
   * @param {{cases?: string[], count?: number, avoid?: string[]}} options
   */
  sampleSeeds(options = {}) {
    const cases = new Set(options.cases && options.cases.length > 0 ? options.cases : this.caseNames)
    const avoid = new Set(options.avoid ?? [])
    const pool = []
    for (let ci = 0; ci < this.chunks.length; ci += 1) {
      const chunk = this.chunks[ci]
      if (!cases.has(chunk.case)) continue
      if (this.junkChunks.has(ci)) continue
      const text = clean(chunk.text)
      const length = text.length
      if (length < 420 || length > 3200) continue
      if (avoid.has(chunk.cid)) continue
      const lines = text.split('\n').length
      if (lines < 6) continue
      let weight = 1
      if (length > 700 && length < 2200) weight += 0.7
      if ((chunk.speakers ?? []).length >= 4) weight += 0.5
      pool.push({ chunk, weight })
    }
    if (pool.length === 0) return []

    const picked = []
    const total = Math.max(1, Math.min(options.count ?? 1, 20))
    const remaining = [...pool]
    while (picked.length < total && remaining.length > 0) {
      let sum = 0
      for (const item of remaining) sum += item.weight
      let target = Math.random() * sum
      let index = 0
      for (; index < remaining.length; index += 1) {
        target -= remaining[index].weight
        if (target <= 0) break
      }
      const chosen = remaining.splice(Math.min(index, remaining.length - 1), 1)[0]
      if (!chosen) break
      picked.push(chosen.chunk)
    }
    return picked.map((chunk) => ({
      cid: chunk.cid,
      case: chunk.case,
      season: chunk.season,
      scene: chunk.scene || '',
      flash: Boolean(chunk.flash),
      beat: chunk.beat ?? '',
      text: this.#trimChunk(chunk, [], 1800),
    }))
  }

  /** 相邻两句台词，用于模型失败时的接龙选择题。 */
  dialoguePair(cases) {
    const allow = new Set(cases && cases.length > 0 ? cases : this.caseNames)
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const index = Math.floor(Math.random() * this.utterances.length)
      const next = this.utterances[index + 1]
      const current = this.utterances[index]
      if (!current || !next) continue
      if (!allow.has(current.case)) continue
      const a = clean(current.text)
      const b = clean(next.text)
      if (a.length < 4 || b.length < 4 || b.length > 30) continue
      const distractors = []
      for (let tries = 0; tries < 60 && distractors.length < 3; tries += 1) {
        const other = this.utterances[Math.floor(Math.random() * this.utterances.length)]
        const text = clean(other?.text)
        if (!text || text === b || text.length < 4 || text.length > 30 || distractors.includes(text)) continue
        if (/^[（(]/.test(text)) continue
        distractors.push(text)
      }
      if (distractors.length < 3) continue
      return { case: current.case, season: current.season, speaker: current.speaker, prompt: a, answer: b, distractors }
    }
    return null
  }

  /** 全剧案件清单：按部列出，各一句梗概（“剧里一共有哪些案子”这类问题直接用它）。 */
  caseOverview() {
    const lines = []
    let total = 0
    for (const [season, names] of this.casesBySeason) {
      const items = names.map((name) => {
        const meta = this.plot.cases[name] ?? {}
        const brief = clean(meta.brief) || clean(meta.summary).split('。')[0]
        total += 1
        return `《${name}》${brief}`
      })
      if (items.length > 0) lines.push(`${season}：${items.join('；')}。`)
    }
    return `台词库里一共 ${total} 个案子：\n${lines.join('\n')}`
  }
}
