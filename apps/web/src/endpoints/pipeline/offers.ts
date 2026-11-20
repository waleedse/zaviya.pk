import type { Endpoint, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { OfferImportBodySchema, matchPhone, offerSlug, type OfferImportItem, type PhoneKey } from '@zaviya/shared'
import { json, parseJson, requireBotOrAdmin } from './helpers'

/**
 * Store offers import (15 Nov 2026). The worker's rolling store crawl posts one feed page at a time (up to 250
 * listings). Each listing is upserted by store + handle, linked to our phone or appliance page when it matches,
 * and keeps its previous price when the price changes ("recent price changes" on /prices).
 */

interface ApplianceKey {
  slug: string
  brand: string
  model: string
}

let cache: { at: number; phones: PhoneKey[]; appliances: ApplianceKey[] } | null = null
const CACHE_MS = 10 * 60_000

export async function keys(req: PayloadRequest) {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache
  const rows = (async (q: ReturnType<typeof sql>) => ((await req.payload.db.drizzle.execute(q)) as unknown as { rows?: Record<string, string>[] }).rows ?? [])
  const phones = (await rows(sql`SELECT p.slug, p.name, b.name AS brand FROM phones p JOIN phone_brands b ON b.id = p.brand_id WHERE coalesce(p.hidden, false) = false`)).map((r) => ({ slug: r.slug!, name: r.name!, brand: r.brand! }))
  const appliances = (await rows(sql`SELECT slug, brand, model FROM appliances WHERE model IS NOT NULL AND model <> '' AND coalesce(hidden, false) = false`)).map((r) => ({ slug: r.slug!, brand: r.brand!, model: r.model! }))
  cache = { at: Date.now(), phones, appliances }
  return cache
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function matchOffer(item: Pick<OfferImportItem, 'title' | 'brand' | 'group' | 'model'>, k: { phones: PhoneKey[]; appliances: ApplianceKey[] }): { kind: 'phone' | 'appliance'; slug: string } | null {
  if (item.group === 'mobiles') {
    const slug = matchPhone(item, k.phones)
    return slug ? { kind: 'phone', slug } : null
  }
  if (item.group === 'home-appliances' && item.model) {
    const m = norm(item.model)
    const hit = k.appliances.find((a) => norm(a.model) === m && (!item.brand || norm(item.brand).includes(norm(a.brand)) || norm(a.brand).includes(norm(item.brand))))
    return hit ? { kind: 'appliance', slug: hit.slug } : null
  }
  return null
}

export const offerEndpoints: Endpoint[] = [
  {
    path: '/pipeline/offers/import',
    method: 'post',
    handler: async (req) => {
      const denied = requireBotOrAdmin(req)
      if (denied) return denied
      const parsed = await parseJson(req, OfferImportBodySchema)
      if ('error' in parsed) return parsed.error
      const k = await keys(req)
      let matched = 0
      let changed = 0
      for (const it of parsed.data.items) {
        const slug = offerSlug(it.store, it.handle)
        const m = matchOffer(it, k)
        if (m) matched++
        const price = it.pricePkr
        const res = (await req.payload.db.drizzle.execute(sql`
          INSERT INTO store_offers (slug, store, title, brand, "group", url, image_url, price_pkr, list_price_pkr, in_stock, model, match_kind, match_slug, seen_at, price_changed_at, updated_at, created_at)
          VALUES (${slug}, ${it.store}, ${it.title}, ${it.brand ?? null}, ${it.group}, ${it.url}, ${it.imageUrl ?? null}, ${price}, ${it.listPricePkr ?? null}, ${it.inStock ?? null}, ${it.model ?? null}, ${m?.kind ?? null}, ${m?.slug ?? null}, now(), now(), now(), now())
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title, brand = EXCLUDED.brand, "group" = EXCLUDED."group", url = EXCLUDED.url,
            image_url = coalesce(EXCLUDED.image_url, store_offers.image_url),
            prev_price_pkr = CASE WHEN EXCLUDED.price_pkr IS DISTINCT FROM store_offers.price_pkr AND store_offers.price_pkr IS NOT NULL THEN store_offers.price_pkr ELSE store_offers.prev_price_pkr END,
            price_changed_at = CASE WHEN EXCLUDED.price_pkr IS DISTINCT FROM store_offers.price_pkr AND store_offers.price_pkr IS NOT NULL THEN now() ELSE store_offers.price_changed_at END,
            price_pkr = EXCLUDED.price_pkr, list_price_pkr = EXCLUDED.list_price_pkr, in_stock = EXCLUDED.in_stock, model = EXCLUDED.model,
            match_kind = EXCLUDED.match_kind, match_slug = EXCLUDED.match_slug, seen_at = now(), updated_at = now()
          RETURNING (xmax <> 0 AND price_changed_at = now()) AS changed, (xmax = 0) AS inserted
        `)) as unknown as { rows?: { changed: boolean }[] }
        const row = res.rows?.[0] as { changed?: boolean; inserted?: boolean } | undefined
        if (row?.changed) changed++
        // price history: first sight and every price change (docs/PRODUCT-SEARCH.md section 2)
        if (row?.changed || row?.inserted) {
          await req.payload.db.drizzle.execute(sql`INSERT INTO offer_price_history (offer_slug, price_pkr, list_price_pkr, in_stock) VALUES (${slug}, ${price}, ${it.listPricePkr ?? null}, ${it.inStock ?? null})`)
        }
      }
      return json({ ok: true, received: parsed.data.items.length, matched, changed })
    },
  },
]
