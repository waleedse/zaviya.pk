import type { ApiArticle } from './lib.js'

/**
 * ZAV-150: the daily trend-reaction Reel. Pick the strongest trending topic (Google Trends Pakistan first, then X)
 * for which we published an article in the last 12 hours. Facts come only from that article.
 */
export const TREND_RULES = { freshMs: 12 * 3600_000 }
export const TREND_SLOT_NAME = 'trend'
/** Render time; posting follows after the veto (about 13:00 to 13:15 PKT). */
export const TREND_SLOT_SPEC = `${TREND_SLOT_NAME}@12:55=trend25`

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'news', 'live', 'today', 'latest', 'pakistan', 'pak', 'vs', 'update', 'updates'])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))
}

function articleText(a: ApiArticle): string {
  return ` ${tokens([a.title, a.dek ?? '', ...(a.tags ?? []).map((t) => t.name)].join(' ')).join(' ')} `
}

/** Every significant word of the trend appears in the article (a one-word trend must be at least 4 letters). */
export function trendMatches(trend: string, a: ApiArticle): boolean {
  const t = tokens(trend)
  if (!t.length) return false
  if (t.length === 1 && t[0]!.length < 4) return false
  const text = articleText(a)
  return t.every((w) => text.includes(` ${w} `) || text.includes(` ${w}s `))
}

export interface TrendPick {
  id: number
  trend: string
}

/**
 * `trends` is ranked strongest first (Google, then X). The newest matching article wins within a trend.
 * `usedIds` are articles a trend Reel already covered, so the same story is not reacted to twice.
 */
export function pickTrendArticle(
  articles: ApiArticle[],
  trends: string[],
  now: number,
  usedIds: Set<number> = new Set(),
): TrendPick | { skip: string } {
  if (!trends.length) return { skip: 'no trends available' }
  const fresh = articles
    .filter((a) => a.heroImage?.url && !usedIds.has(a.id))
    .filter((a) => {
      const age = now - Date.parse(a.publishedAt)
      return age >= 0 && age <= TREND_RULES.freshMs
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  if (!fresh.length) return { skip: 'no article with a photo published in the last 12 h' }
  for (const trend of trends) {
    const hit = fresh.find((a) => trendMatches(trend, a))
    if (hit) return { id: hit.id, trend }
  }
  return { skip: `none of ${trends.length} trends matches a published article of the last 12 h` }
}

/** Trend names from a Redis snapshot (`{ trends: [...] }` of strings or `{ title | query | name }` objects). */
export function trendNames(raw: string | null): string[] {
  if (!raw) return []
  try {
    const list = (JSON.parse(raw) as { trends?: unknown[] }).trends ?? []
    return list
      .map((t) => (typeof t === 'string' ? t : ((t as { title?: string; query?: string; name?: string })?.title ?? (t as { query?: string })?.query ?? (t as { name?: string })?.name ?? '')))
      .filter((t): t is string => !!t)
  } catch {
    return []
  }
}
