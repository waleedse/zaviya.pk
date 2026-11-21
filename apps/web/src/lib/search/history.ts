import { sql } from '@payloadcms/db-postgres'
import { getPayloadClient } from '../payload'

export interface PricePoint { day: string; price: number }

/** Lowest recorded price per day across a product's store listings, last 90 days (offer_price_history is written on first sight and every change) */
export async function priceHistory(slugs: string[]): Promise<PricePoint[]> {
  if (!slugs.length) return []
  try {
    const payload = await getPayloadClient()
    const res = (await payload.db.drizzle.execute(
      sql`WITH days AS (SELECT generate_series(date_trunc('day', now()) - interval '89 days', date_trunc('day', now()), interval '1 day') AS d),
        latest AS (
          SELECT d.d, h.offer_slug, (SELECT price_pkr FROM offer_price_history x WHERE x.offer_slug = h.offer_slug AND x.at < d.d + interval '1 day' ORDER BY x.at DESC LIMIT 1) AS price
          FROM days d CROSS JOIN (SELECT DISTINCT offer_slug FROM offer_price_history WHERE offer_slug IN (${sql.join(slugs.slice(0, 30).map((s) => sql`${s}`), sql`, `)})) h)
        SELECT to_char(d, 'YYYY-MM-DD') AS day, min(price)::float AS price FROM latest WHERE price IS NOT NULL GROUP BY d ORDER BY d`,
    )) as unknown as { rows?: { day: string; price: number }[] }
    return (res.rows ?? []).map((r) => ({ day: r.day, price: Number(r.price) }))
  } catch {
    return []
  }
}
