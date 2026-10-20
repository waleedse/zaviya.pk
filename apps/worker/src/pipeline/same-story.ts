/**
 * Same-event matching (ZAV-134). Triage runs per cluster and the LLM never sees our own articles, so
 * one event (a polio case, a ban, a defence pact meeting) became 2-4 articles from separate clusters.
 * This matches a new cluster to an article we already hold by headline overlap, in code.
 */

export interface RecentArticle {
  id: string
  title: string
  publishedAt?: string | null
  /** Live (published) or still a draft waiting for the editor */
  published: boolean
  /** Time of the newest live update, if any */
  lastUpdateAt?: string | null
}

/** One live update per article in this window. */
export const UPDATE_COOLDOWN_MS = 2 * 3_600_000
/** How far back an article still counts as "the same story". */
export const SAME_STORY_WINDOW_MS = 48 * 3_600_000

const STOP = new Set(
  `a an the and or but of to in on at by for from with as is are was were be been being it its this that these those
  over after before into than then up out off about amid against also not no has have had will would can could may might
  says say said new now more most first just who whom what when where why how their his her they them
  pakistan pakistani pakistanis news live update updates report reports reported today latest`.split(/\s+/),
)

/** Ordinals and number words differ between outlets ("first" vs "seventh" case), so they are ignored. */
const NUMBER_WORDS = new Set(
  'first second third fourth fifth sixth seventh eighth ninth tenth one two three four five six seven eight nine ten'.split(' '),
)

/** Drops a trailing outlet name: "Headline - Dawn" / "Headline | The News". */
function stripOutlet(title: string): string {
  return title.replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, '')
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 4 && w.endsWith('es') && /(s|x|ch|sh)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

export function significantTokens(title: string): { words: Set<string>; numbers: Set<string> } {
  const words = new Set<string>()
  const numbers = new Set<string>()
  const raw = stripOutlet(title).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  for (const t of raw) {
    if (/^\d+$/.test(t) || /^\d/.test(t)) {
      numbers.add(t)
      continue
    }
    if (t.length < 2 || STOP.has(t) || NUMBER_WORDS.has(t)) continue
    words.add(stem(t))
  }
  return { words, numbers }
}

/** Overlap of two headlines: shared words, and the share of the shorter headline they cover. */
export function headlineOverlap(a: string, b: string): { shared: number; ratio: number; numbersConflict: boolean } {
  const A = significantTokens(a)
  const B = significantTokens(b)
  let shared = 0
  for (const w of A.words) if (B.words.has(w)) shared++
  const min = Math.min(A.words.size, B.words.size)
  const ratio = min ? shared / min : 0
  // "rate held at 11%" and "rate cut by 100bps" are different news: both carry figures and none agree
  let numShared = 0
  for (const n of A.numbers) if (B.numbers.has(n)) numShared++
  const numbersConflict = A.numbers.size > 0 && B.numbers.size > 0 && numShared === 0
  return { shared, ratio, numbersConflict }
}

export function isSameEvent(a: string, b: string): boolean {
  const o = headlineOverlap(a, b)
  return o.shared >= 3 && o.ratio >= 0.4 && !o.numbersConflict
}

export type SameStoryVerdict =
  | { kind: 'none' }
  /** Article is live and has had no update in the cooldown window: add this as a live update */
  | { kind: 'update'; article: RecentArticle }
  /** Same event, but the article is a draft or was updated less than 2h ago: do not write a second article */
  | { kind: 'skip'; article: RecentArticle; reason: string }

/**
 * Finds the already-held article that covers the same event as this cluster's headlines.
 * Several matches: the live one that was published first wins (it has the URL, the links and the social posts).
 */
export function findSameStory(
  clusterTitles: string[],
  articles: RecentArticle[],
  now: number = Date.now(),
): SameStoryVerdict {
  const titles = clusterTitles.filter(Boolean)
  const matches = articles.filter((a) => {
    const t = a.publishedAt ? new Date(a.publishedAt).getTime() : now
    if (Number.isFinite(t) && now - t > SAME_STORY_WINDOW_MS) return false
    return titles.some((ct) => isSameEvent(ct, a.title))
  })
  if (!matches.length) return { kind: 'none' }
  matches.sort((x, y) => Number(y.published) - Number(x.published) || (x.publishedAt ?? '').localeCompare(y.publishedAt ?? ''))
  const article = matches[0]!
  if (!article.published) return { kind: 'skip', article, reason: `same story as draft article ${article.id}` }
  const last = article.lastUpdateAt ? new Date(article.lastUpdateAt).getTime() : 0
  if (last && now - last < UPDATE_COOLDOWN_MS) {
    return { kind: 'skip', article, reason: `same story as article ${article.id}, updated less than 2h ago` }
  }
  return { kind: 'update', article }
}
