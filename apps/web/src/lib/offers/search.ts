import { sql } from '@payloadcms/db-postgres'
import { RETAIL_STORES } from '@zaviya/shared'
import { getPayloadClient } from '../payload'

/** One store listing in the price search: n name, h link, s store, p price, i image */
export interface OfferHit {
  n: string
  h: string
  s: string
  p: number | null
  i: string | null
}

/** Words of the query, as typed: "macbook 2019" -> every listing whose title has both words, cheapest first */
export function queryWords(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[%_\\]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9.+-]/g, ''))
    .filter((w) => w.length >= 2)
    .slice(0, 5)
}

export async function searchOffers(q: string, limit = 8): Promise<OfferHit[]> {
  const words = queryWords(q)
  if (!words.length) return []
  try {
    const payload = await getPayloadClient()
    const where = sql.join(words.map((w) => sql`title ILIKE ${`%${w}%`}`), sql` AND `)
    const res = (await payload.db.drizzle.execute(
      sql`SELECT slug, title, url, store, price_pkr, image_url, match_kind, match_slug FROM store_offers WHERE ${where} AND price_pkr IS NOT NULL AND seen_at > now() - interval '3 days' ORDER BY coalesce(in_stock, true) DESC, price_pkr ASC LIMIT ${limit}`,
    )) as unknown as { rows?: Record<string, any>[] }
    return (res.rows ?? []).map((r) => ({
      n: String(r.title),
      // a listing matched to our phone page goes there; everything else to its own product page
      h: r.match_kind === 'phone' && r.match_slug ? `/mobile/${r.match_slug}` : `/prices/item/${r.slug}`,
      s: RETAIL_STORES.find((x) => x.slug === r.store)?.name ?? String(r.store),
      p: r.price_pkr == null ? null : Number(r.price_pkr),
      i: r.image_url ?? null,
    }))
  } catch {
    return []
  }
}
