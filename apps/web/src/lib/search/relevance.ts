/**
 * Query relevance rules for product search (docs/PRODUCT-SEARCH.md). Meilisearch's default `last` matching strategy silently
 * drops trailing words when nothing matches them ("macbook speakers" -> 64 laptops). Two rules fix what the reader sees:
 *  1. a query that names a part or accessory (speaker, charger, case, battery...) must match ALL words, else we say nothing matched;
 *  2. otherwise dropped words are reported so the page can show "No exact match for 'x', showing 'y'".
 */

/** Parts and accessories: the word is what the buyer wants, the other words only say which device it fits. */
const PART_WORDS = new Set([
  'speaker', 'speakers', 'charger', 'chargers', 'case', 'cases', 'cover', 'covers', 'battery', 'batteries',
  'adapter', 'adaptor', 'cable', 'keyboard', 'protector', 'sleeve', 'replacement', 'strap', 'stand',
])

export const tokenize = (q: string): string[] => q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** `all` when a multi-word query names a part or accessory, else Meilisearch's forgiving default */
export function matchingStrategyFor(q: string): 'all' | 'last' {
  const t = tokenize(q)
  return t.length >= 2 && t.some((w) => PART_WORDS.has(w)) ? 'all' : 'last'
}

export type SearchNote =
  | { kind: 'none'; words: string[] } // strict search found nothing: show no products
  | { kind: 'dropped'; dropped: string[]; used: string[] } // some words were ignored to find these results

/** Words Meilisearch ignored, from the top hit's `words` ranking detail (it keeps the first N query words and drops the rest) */
export function droppedWords(q: string, topHit?: { _rankingScoreDetails?: { words?: { matchingWords: number; maxMatchingWords: number } } }): SearchNote | null {
  const t = tokenize(q)
  const w = topHit?._rankingScoreDetails?.words
  if (!w || t.length < 2 || w.maxMatchingWords !== t.length || w.matchingWords >= w.maxMatchingWords || w.matchingWords < 1) return null
  return { kind: 'dropped', used: t.slice(0, w.matchingWords), dropped: t.slice(w.matchingWords) }
}

/** The one-line explanation shown above the results */
export function noteText(n: SearchNote): string {
  const list = (a: string[]) => a.map((x) => `‘${x}’`).join(', ')
  return n.kind === 'none'
    ? `No product matches all of ${list(n.words)}. Try fewer words, or the product name only.`
    : `No exact match for ${list(n.dropped)}, showing ${list(n.used)}.`
}
