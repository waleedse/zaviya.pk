/**
 * Search demand and "hot" items for /prices (6 Nov 2026, docs/PRICE-ENGINE.md). Pure functions, tested on their own.
 *  - a search ("honda cd 70 price in pakistan") matches an item when every meaningful word of the search is in the
 *    item's name, brand or category ("price", "pakistan", years and city names do not count)
 *  - hotScore = 10 x unique visitors in the last 7 days + the priority of the strongest search the item answers
 */

const STOP = new Set([
  'price', 'prices', 'rate', 'rates', 'in', 'pakistan', 'pk', 'today', 'todays', 'latest', 'new', 'of', 'the', 'per', 'for', 'and',
  'qeemat', 'kimat', 'ka', 'ki', 'ke', 'aaj', 'cost', 'list', 'official', 'model', 'models', 'mein', 'me',
  'lahore', 'karachi', 'islamabad', 'rawalpindi', 'faisalabad', 'multan', 'peshawar', 'quetta', 'hyderabad', 'sialkot', 'gujranwala',
])

/** Words of a search or a name, with "cd70" split as "cd 70" and years dropped */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z]{2,})/g, '$1 $2')
    .split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w && !STOP.has(w) && !/^20\d\d$/.test(w))
}

/** Synonyms people use for the same thing */
const SYNONYMS: Record<string, string[]> = {
  atta: ['flour', 'wheat'],
  aata: ['atta', 'flour'],
  ata: ['atta', 'flour'],
  flour: ['atta'],
  cheeni: ['sugar'],
  sugar: ['cheeni'],
  doodh: ['milk'],
  ande: ['eggs'],
  anday: ['eggs'],
  egg: ['eggs'],
  murghi: ['chicken'],
  gosht: ['mutton', 'beef'],
  ghee: ['ghee'],
  cylinder: ['lpg'],
  gas: ['lpg'],
  bike: ['motorcycle', 'motorcycles'],
  bikes: ['motorcycle', 'motorcycles'],
  fridge: ['refrigerator', 'refrigerators'],
  ac: ['ac', 'conditioners'],
  geyser: ['geyser', 'geysers'],
  heater: ['heater', 'heaters'],
  tamatar: ['tomatoes'],
  tomato: ['tomatoes'],
  pyaz: ['onions'],
  onion: ['onions'],
  aloo: ['potatoes'],
  potato: ['potatoes'],
  daal: ['daal'],
  dal: ['daal'],
}

export interface DemandItem {
  slug: string
  name: string
  brandName: string
  categoryName: string
  categorySlug: string
}

export function itemWords(it: DemandItem): Set<string> {
  return new Set(words(`${it.brandName} ${it.name} ${it.categoryName} ${it.categorySlug.replace(/-/g, ' ')}`))
}

/** Items that answer a search; empty when every meaningful word is a stop word */
export function matchSearch(query: string, items: DemandItem[], index = new Map(items.map((i) => [i.slug, itemWords(i)]))): DemandItem[] {
  const q = words(query)
  if (!q.length) return []
  return items.filter((it) => {
    const w = index.get(it.slug) ?? itemWords(it)
    return q.every((t) => w.has(t) || (SYNONYMS[t] ?? []).some((s) => w.has(s)))
  })
}

/** hotScore per slug from 7-day unique visitors and the searches each item answers */
export function hotScores(items: DemandItem[], visitors: Map<string, number>, demand: { query: string; priority: number }[]): { scores: Map<string, number>; matches: Map<string, string[]> } {
  const index = new Map(items.map((i) => [i.slug, itemWords(i)]))
  const boost = new Map<string, number>()
  const matches = new Map<string, string[]>()
  for (const d of demand) {
    const hit = matchSearch(d.query, items, index)
    matches.set(d.query, hit.map((h) => h.slug))
    // a broad search ("ac price") spreads over many items: each gets less
    const share = hit.length > 10 ? Math.round(d.priority / 3) : d.priority
    for (const h of hit) boost.set(h.slug, Math.max(boost.get(h.slug) ?? 0, share))
  }
  const scores = new Map<string, number>()
  for (const it of items) scores.set(it.slug, (visitors.get(it.slug) ?? 0) * 10 + (boost.get(it.slug) ?? 0))
  return { scores, matches }
}
