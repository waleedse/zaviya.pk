/**
 * Guards run before a social post is queued or sent (ZAV-120):
 * - every number in the copy must come from the article (a dropped digit turned $21.5bn into 1.5bn)
 * - the same story must not be posted twice on one platform
 */

const NUM = /\d[\d,]*(?:\.\d+)?/g

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

/** Numbers that appear in the social copy but nowhere in the article text. Whole numbers only: "1.5" does not match inside "21.5". */
export function numbersNotInArticle(copy: string, articleText: string): string[] {
  const known = new Set(toNumbers(articleText).map((n) => n.value))
  const bad: string[] = []
  for (const n of toNumbers(stripNoise(copy))) {
    if (!known.has(n.value) && !bad.includes(n.raw)) bad.push(n.raw)
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
