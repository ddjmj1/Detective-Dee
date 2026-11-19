/**
 * 小说补充层：用钱雁秋《神探狄仁杰》原著补台词没交代的空白。
 *
 * 边界（和 QQ 机器人一致）：
 * - 小说不是台词，不能当“原话”引用，也不能覆盖剧集已经演出来的事实；
 * - 普通问题第一轮只查台词/人物/专名，台词定位成功后才找“同一场景”的小说补动作/心理/表情；
 * - 台词查不到、或用户明确问“小说/原著”时，才进入“小说独有模式”；
 * - 每条证据都带“小说《部》第X章”的出处，提示词要求回答时标明“小说补充”。
 */

const BAD_RE = /(ireadweek|微信公众号|本书由|版权所有|ISBN|小编)/
const PUNCT_RE = /[\s，。！？、：；“”‘’（）【】…—,.!?;:"'()[\]]/g

/** 去掉空白与标点，用于公共子串比较。 */
export function plain(text) {
  return String(text ?? '').replace(PUNCT_RE, '')
}

/** 最长公共子串长度（只用于短句对短段，规模很小）。 */
export function lcsLength(a, b) {
  if (!a || !b) return 0
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  let prev = new Uint16Array(short.length + 1)
  let best = 0
  for (let i = 1; i <= long.length; i += 1) {
    const cur = new Uint16Array(short.length + 1)
    const ch = long[i - 1]
    for (let j = 1; j <= short.length; j += 1) {
      if (ch === short[j - 1]) {
        const value = prev[j - 1] + 1
        cur[j] = value
        if (value > best) best = value
      }
    }
    prev = cur
  }
  return best
}

function extractLines(blockText) {
  const lines = []
  for (const raw of String(blockText ?? '').split('\n')) {
    let line = raw.replace(/^【[^】]*】/, '').trim()
    line = line.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()
    if (line.length < 10) continue
    if (/^[，。！？…、；：\s]+$/.test(line)) continue
    lines.push(line)
  }
  return lines
}

export class Novel {
  constructor(payload) {
    this.available = false
    this.docs = []
    this.byChid = new Map()
    this.volumes = new Map()
    this.chapters = new Map()
    this.allText = ''
    this.starts = new Int32Array(0)
    if (!payload || typeof payload !== 'object') return
    const rawVolumes = Array.isArray(payload.volumes) ? payload.volumes : []
    const rawChapters = Array.isArray(payload.chapters) ? payload.chapters : []
    const rawParas = Array.isArray(payload.paragraphs) ? payload.paragraphs : []
    if (rawParas.length === 0) return

    for (const volume of rawVolumes) this.volumes.set(String(volume.vid), volume)
    for (const chapter of rawChapters) this.chapters.set(String(chapter.chid), chapter)

    const docs = []
    for (let i = 0; i < rawParas.length; i += 1) {
      const para = rawParas[i]
      const chapter = this.chapters.get(String(para.chid))
      if (!chapter) continue
      const text = String(para.text ?? '').trim()
      if (text.length < 3 || BAD_RE.test(text)) continue
      const chid = String(chapter.chid)
      const siblings = this.byChid.get(chid)
      const doc = {
        pid: String(para.pid ?? `p${String(i).padStart(6, '0')}`),
        chid,
        case: String(chapter.case ?? ''),
        season: String(chapter.season ?? ''),
        volume: String(chapter.volume ?? ''),
        chapterNumber: String(chapter.number ?? ''),
        chapterTitle: String(chapter.title ?? ''),
        chapterOrd: Number(chapter.ord) || 0,
        pos: siblings ? siblings.length : 0,
        ord: i,
        text,
        dialogue: Boolean(para.dialogue),
      }
      docs.push(doc)
      if (siblings) siblings.push(doc)
      else this.byChid.set(chid, [doc])
    }
    if (docs.length === 0) return

    this.docs = docs
    this.allText = docs.map((doc) => doc.text).join('\n')
    const starts = new Int32Array(docs.length)
    let offset = 0
    for (let i = 0; i < docs.length; i += 1) {
      starts[i] = offset
      offset += docs[i].text.length + 1
    }
    this.starts = starts
    this.available = true
  }

  stats() {
    return {
      available: this.available,
      volumes: this.volumes.size,
      chapters: this.chapters.size,
      paragraphs: this.docs.length,
    }
  }

  contains(name) {
    return Boolean(name) && this.allText.includes(name)
  }

  label(doc) {
    const volume = doc.volume ? `《${doc.volume}》` : ''
    const where = doc.chapterNumber === '楔子' ? '楔子' : `${doc.chapterNumber}《${doc.chapterTitle}》`
    const casePart = doc.case ? `（对应剧集《${doc.case}》）` : ''
    return `小说${volume}${where}${casePart}`
  }

  /** 同一章里取前后若干段，补动作、心理、表情。 */
  windowDocs(doc, before = 1, after = 2, maxChars = 900) {
    const siblings = this.byChid.get(doc.chid) || [doc]
    const pos = doc.pos >= 0 && doc.pos < siblings.length ? doc.pos : 0
    const start = Math.max(0, pos - before)
    const end = Math.min(siblings.length, pos + after + 1)
    const out = []
    let used = 0
    for (const item of siblings.slice(start, end)) {
      if (out.length > 0 && used + item.text.length > maxChars) continue
      out.push(item)
      used += item.text.length
    }
    return out.length > 0 ? out : [doc]
  }

  #docAt(offset) {
    const starts = this.starts
    let low = 0
    let high = starts.length - 1
    let found = 0
    while (low <= high) {
      const mid = (low + high) >> 1
      if (starts[mid] <= offset) {
        found = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return this.docs[found]
  }

  /** 用 6 字探针在大文本里定位候选段（比逐段 indexOf 快一个数量级）。 */
  #probeCandidates(line, limit = 80) {
    const text = plain(line)
    if (text.length < 6) return []
    const probes = new Set()
    probes.add(text.slice(0, 6))
    probes.add(text.slice(Math.floor(text.length / 2) - 3, Math.floor(text.length / 2) + 3))
    probes.add(text.slice(-6))
    const seen = new Set()
    const out = []
    for (const probe of probes) {
      if (probe.length < 6) continue
      let from = 0
      for (;;) {
        const at = this.allText.indexOf(probe, from)
        if (at < 0) break
        const doc = this.#docAt(at)
        if (doc && !seen.has(doc.pid)) {
          seen.add(doc.pid)
          out.push(doc)
          if (out.length >= limit) return out
        }
        from = at + 1
      }
    }
    return out
  }

  /**
   * 按给定词检索小说段落（词由调用方给，避免在这里做分词）。
   * @param {string[]} terms
   */
  search(terms, { k = 6, caseName = null, minScore = 2, minLength = 24 } = {}) {
    if (!this.available) return []
    const words = [...new Set((terms || []).map((term) => String(term ?? '').trim()).filter(Boolean))]
    if (words.length === 0) return []
    const hits = []
    for (const doc of this.docs) {
      if (caseName && doc.case !== caseName) continue
      if (doc.text.length < minLength) continue
      let score = 0
      for (const word of words) {
        let at = doc.text.indexOf(word)
        if (at < 0) continue
        let count = 1
        let from = at + word.length
        while (count < 3) {
          const next = doc.text.indexOf(word, from)
          if (next < 0) break
          count += 1
          from = next + word.length
        }
        score += count * Math.min(word.length, 4)
      }
      if (score >= minScore) hits.push([score, doc])
    }
    if (hits.length === 0) return []
    hits.sort((left, right) => right[0] - left[0])
    const top = hits[0][0]
    const perChapter = new Map()
    const out = []
    for (const [score, doc] of hits) {
      const used = perChapter.get(doc.chid) ?? 0
      if (used >= 5) continue
      if (used >= 1 && score < top * 0.25) continue
      perChapter.set(doc.chid, used + 1)
      out.push([score, doc])
      if (out.length >= Math.max(k, 12)) break
    }
    return out
  }

  /**
   * 把一段台词按“原句”对齐到小说同场景：只认长句与段落的最长公共子串。
   * @returns {Array<[number, number, object]>} [lcs, score, doc]
   */
  align(blockText, { caseName = null, terms = [], maxLines = 4 } = {}) {
    if (!this.available) return []
    const lines = extractLines(blockText)
    if (lines.length === 0) return []
    const wanted = terms.filter(Boolean)
    let pool = lines
    if (wanted.length > 0) {
      const preferred = lines.filter((line) => wanted.some((term) => line.includes(term)))
      if (preferred.length === 0) return []
      pool = preferred
    }
    const chosen = [...new Set(pool)].sort((a, b) => b.length - a.length).slice(0, maxLines)
    const found = []
    const seen = new Set()
    for (const line of chosen) {
      const threshold = Math.max(8, Math.min(Math.floor(line.length * 0.5), 22))
      const plainLine = plain(line)
      let best = null
      for (const doc of this.#probeCandidates(line)) {
        if (seen.has(doc.pid)) continue
        if (caseName && doc.case !== caseName) continue
        const lcs = lcsLength(plainLine, plain(doc.text))
        if (lcs < threshold) continue
        if (best === null || lcs > best[0]) best = [lcs, doc]
      }
      if (best) {
        seen.add(best[1].pid)
        found.push([best[0], 0, best[1]])
      }
    }
    found.sort((left, right) => right[0] - left[0])
    return found
  }
}
