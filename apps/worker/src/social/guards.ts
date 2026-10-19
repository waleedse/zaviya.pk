/**
 * Guards run before a social post is queued or sent (ZAV-120):
 * - every number in the copy must come from the article (a dropped digit turned $21.5bn into 1.5bn)
 * - the same story must not be posted twice on one platform
 */

const NUM = /\d[\d,]*(?:\.\d+)?/g

/** "250k", "1.6m", "21.5bn", "3 crore": the number and the multiplier written right after it */
const NUM_SUFFIX = /(\d[\d,]*(?:\.\d+)?)\s?(k|thousand|m|mn|million|b|bn|billion|tn|trillion|lakh|lac|crore|cr)\b/gi
const MULTIPLIER: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, tn: 1e12, trillion: 1e12, lakh: 1e5, lac: 1e5, crore: 1e7, cr: 1e7,
}

const WORD_VALUES: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12,
}

function stripNoise(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/@[\w]+/g, ' ')
}

function toNumbers(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = []
  for (const m of text.match(NUM) ?? []) {
    const clean = m.replace(/,+$/, '')
    const value = Number(clean.replace(/,/g, ''))
    if (Number.isFinite(value)) out.push({ raw: clean, value })
  }
  return out
}

/** Every value a text states: digits, digits with a multiplier ("250k" is 250000) and number words ("four" is 4) */
function statedValues(text: string): Set<number> {
  const values = new Set(toNumbers(text).map((n) => n.value))
  for (const m of text.matchAll(NUM_SUFFIX)) {
    const v = Number(m[1]!.replace(/,/g, '')) * MULTIPLIER[m[2]!.toLowerCase()]!
    if (Number.isFinite(v)) values.add(Math.round(v * 1e6) / 1e6)
  }
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) if (w in WORD_VALUES) values.add(WORD_VALUES[w]!)
  return values
}

/** Numbers that appear in the social copy but nowhere in the article text. Whole numbers only: "1.5" does not match inside "21.5". */
export function numbersNotInArticle(copy: string, articleText: string): string[] {
  const known = statedValues(articleText)
  const clean = stripNoise(copy)
  // the copy's own "250k" counts as 250000, and the "250" in front of its suffix is checked as that whole figure
  const scaled = new Map<string, number>()
  for (const m of clean.matchAll(NUM_SUFFIX)) scaled.set(m[1]!.replace(/,+$/, ''), Number(m[1]!.replace(/,/g, '')) * MULTIPLIER[m[2]!.toLowerCase()]!)
  const bad: string[] = []
  for (const n of toNumbers(clean)) {
    const value = scaled.has(n.raw) ? Math.round(scaled.get(n.raw)! * 1e6) / 1e6 : n.value
    if (!known.has(value) && !known.has(n.value) && !bad.includes(n.raw)) bad.push(n.raw)
  }
  return bad
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'its', 'are', 'was', 'has', 'have', 'into', 'over', 'after', 'amid', 'says', 'said', 'new', 'will', 'than', 'but', 'not', 'how', 'why', 'what'])

function words(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/** Two headlines about the same event: at least 3 shared words and half of the shorter headline */
export function similarTitles(a: string, b: string): boolean {
  const wa = words(a)
  const wb = words(b)
  const min = Math.min(wa.size, wb.size)
  if (min === 0) return false
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared >= 3 && shared / min >= 0.5
}

export type RecentSocialPost = { articleId: string; clusterId?: string | null; title: string }

/** The recent post (same platform, last 6h) that this story duplicates, if any */
export function findDuplicateStory(
  current: { articleId: string; clusterId?: string | null; title: string },
  recent: RecentSocialPost[],
): RecentSocialPost | undefined {
  return recent.find(
    (r) =>
      r.articleId !== current.articleId &&
      ((current.clusterId && r.clusterId && String(current.clusterId) === String(r.clusterId)) || similarTitles(current.title, r.title)),
  )
}
