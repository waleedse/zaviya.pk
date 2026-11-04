/**
 * Which stories Google may index (Waleed, 5 Nov 2026: quality over volume).
 *
 * Google showed zaviya.pk ~3,000 times a day at launch (12-15 Oct) and almost never after 16 Oct,
 * while the site published ~150 rewritten stories a day. Thin rewrites stay on the site for readers
 * (noindex, follow) but are kept out of Google and the sitemaps, so Google judges us on the strong pages.
 */

/** Desks where we have our own edge: every story is indexed. */
export const ALWAYS_INDEX_CATEGORIES = new Set(['education-jobs', 'cricket'])
/** Pakistani desks where a story is indexed when it has depth. */
const DEPTH_CATEGORIES = new Set(['pakistan', 'business'])
export const MIN_INDEX_SOURCES = 2
export const MIN_INDEX_WORDS = 401 // 3 minutes at 200 words a minute, as computeReadingTimeMinutes counts

export type IndexInput = {
  category: string
  priority?: string | null
  sourceCount: number
  words: number
}

export function storyNoindex(a: IndexInput): boolean {
  if (ALWAYS_INDEX_CATEGORIES.has(a.category)) return false
  if (a.priority === 'high' || a.priority === 'breaking') return false
  if (DEPTH_CATEGORIES.has(a.category) && a.sourceCount >= MIN_INDEX_SOURCES && a.words >= MIN_INDEX_WORDS) return false
  return true
}

export function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter(Boolean).length
}
