import 'server-only'
import { getPayloadClient } from '@/lib/payload'
import { getAppliances } from './queries'
import { buildSearchIndex, cleanQuery, type SearchIndex } from './search'

/** The search index is rebuilt at most every 5 minutes per server process (prices change daily, not per request) */
let cached: { at: number; value: Promise<SearchIndex> } | null = null
export function getSearchIndex(): Promise<SearchIndex> {
  if (!cached || Date.now() - cached.at > 5 * 60_000) {
    const value = getAppliances().then(buildSearchIndex)
    cached = { at: Date.now(), value }
    value.catch(() => {
      if (cached?.value === value) cached = null
    })
  }
  return cached.value
}

/**
 * A search that found nothing goes to the price-demand list (origin site-search) so the research agent and engineer can
 * see which sources to add. An existing query gets a little more weight each time, up to 100.
 */
export async function logMissedSearch(raw: unknown): Promise<boolean> {
  const query = cleanQuery(raw)
  if (!query) return false
  const payload = await getPayloadClient()
  const found = await payload.find({ collection: 'price-demand', where: { query: { equals: query } }, limit: 1, depth: 0, overrideAccess: true })
  const doc = found.docs[0] as unknown as { id: string | number; priority?: number; origin?: string } | undefined
  if (doc) {
    if (doc.origin === 'site-search') await payload.update({ collection: 'price-demand', id: doc.id, data: { priority: Math.min(100, Number(doc.priority ?? 30) + 2) } as never, overrideAccess: true })
    return true
  }
  await payload.create({ collection: 'price-demand', data: { query, priority: 30, origin: 'site-search', matched: 0, note: 'Typed in the site price search, no match' } as never, overrideAccess: true })
  return true
}
