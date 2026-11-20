import type { Endpoint, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { PRODUCTS_INDEX, RETAIL_STORES, docId, productKey, productsIndexSettings, type ProductDoc } from '@zaviya/shared'
import { meili, meiliConfigured, waitTask } from '@/lib/search/meili'
import { json, requireBotOrAdmin } from './helpers'

/**
 * Product search sync (docs/PRODUCT-SEARCH.md section 4). Postgres `store_offers` is the truth; this turns changed
 * listings into one Meilisearch document per product (same product at several stores = one document) and removes
 * products no store has listed for 3 days. The worker calls it every 2 minutes; `reindex: true` re-sends everything.
 */

type Row = Record<string, any>
const run = async (req: PayloadRequest, q: ReturnType<typeof sql>): Promise<Row[]> =>
  ((await req.payload.db.drizzle.execute(q)) as unknown as { rows?: Row[] }).rows ?? []

const FRESH_DAYS = 3
const BATCH = 1000
const BUDGET_MS = 50_000
let settingsApplied = false

async function ensureIndex() {
  try {
    await meili('GET', `/indexes/${PRODUCTS_INDEX}`)
  } catch {
    const t = await meili<{ taskUid: number }>('POST', '/indexes', { uid: PRODUCTS_INDEX, primaryKey: 'id' })
    await waitTask(t.taskUid)
  }
  if (!settingsApplied) {
    const t = await meili<{ taskUid: number }>('PATCH', `/indexes/${PRODUCTS_INDEX}/settings`, productsIndexSettings())
    await waitTask(t.taskUid)
    settingsApplied = true
  }
}

const storeName = (slug: string) => RETAIL_STORES.find((s) => s.slug === slug)?.name ?? slug

export function buildDoc(key: string, rows: Row[]): ProductDoc | null {
  const offers = rows
    .filter((r) => r.price_pkr != null)
    .map((r) => ({
      store: String(r.store),
      store_name: storeName(String(r.store)),
      price: Number(r.price_pkr),
      list_price: r.list_price_pkr != null && Number(r.list_price_pkr) > Number(r.price_pkr) ? Number(r.list_price_pkr) : null,
      in_stock: r.in_stock !== false,
      url: String(r.url),
      image: (r.image_url as string | null) ?? null,
      updated_at: Math.floor(new Date(r.seen_at ?? Date.now()).getTime() / 1000),
    }))
    .sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || a.price - b.price)
    .slice(0, 30)
  if (!offers.length) return null
  const best = rows.find((r) => Number(r.price_pkr) === offers[0]!.price && String(r.store) === offers[0]!.store) ?? rows[0]!
  const withImage = rows.find((r) => r.image_url)
  const prices = offers.map((o) => o.price)
  const weekAgo = Date.now() - 7 * 86_400_000
  let drop = 0
  for (const r of rows) {
    if (r.prev_price_pkr && r.price_changed_at && new Date(r.price_changed_at).getTime() > weekAgo && Number(r.price_pkr) < Number(r.prev_price_pkr)) {
      drop = Math.max(drop, Math.round((1 - Number(r.price_pkr) / Number(r.prev_price_pkr)) * 100))
    }
  }
  const stores = [...new Set(offers.map((o) => o.store))]
  return {
    id: docId(key),
    title: String(best.title),
    brand: (best.brand as string | null) ?? null,
    model: (best.model as string | null) ?? null,
    group: String(best.group),
    image: (withImage?.image_url as string | null) ?? null,
    image_store: withImage ? String(withImage.store) : null,
    offers,
    min_price: Math.min(...prices),
    max_price: Math.max(...prices),
    store_count: stores.length,
    stores,
    in_stock_any: offers.some((o) => o.in_stock),
    match_kind: (best.match_kind as string | null) ?? null,
    match_slug: (best.match_slug as string | null) ?? null,
    price_drop_pct: drop,
    popularity: stores.length * 10 + (offers.some((o) => o.in_stock) ? 5 : 0) + (best.match_slug ? 20 : 0),
    updated_at: Math.max(...offers.map((o) => o.updated_at)),
  }
}

export async function syncProducts(req: PayloadRequest, opts: { reindex?: boolean } = {}) {
  const started = Date.now()
  await ensureIndex()
  if (opts.reindex) await run(req, sql`UPDATE store_offers SET search_synced_at = NULL`)
  let docs = 0
  let removed = 0
  let rowsDone = 0
  while (Date.now() - started < BUDGET_MS) {
    const rows = await run(req, sql`SELECT id, slug, brand, model, gtin, product_key FROM store_offers WHERE search_synced_at IS NULL OR search_synced_at < updated_at ORDER BY id LIMIT ${BATCH}`)
    if (!rows.length) break
    const ids = rows.map((r) => Number(r.id))
    const keyed = rows.map((r) => ({ id: Number(r.id), key: (r.product_key as string) || productKey({ slug: r.slug, brand: r.brand, model: r.model, gtin: r.gtin }) }))
    const keys = [...new Set(keyed.map((k) => k.key))]
    await run(req, sql`UPDATE store_offers o SET product_key = v.k FROM (VALUES ${sql.join(keyed.map((k) => sql`(${k.id}::int, ${k.key}::text)`), sql`, `)}) AS v(id, k) WHERE o.id = v.id AND o.product_key IS DISTINCT FROM v.k`)
    const all = await run(
      req,
      sql`SELECT slug, store, title, brand, model, "group", url, image_url, price_pkr, list_price_pkr, prev_price_pkr, price_changed_at, in_stock, match_kind, match_slug, seen_at, product_key FROM store_offers WHERE product_key IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)}) AND price_pkr IS NOT NULL AND seen_at > now() - ${`${FRESH_DAYS} days`}::interval`,
    )
    const byKey = new Map<string, Row[]>()
    for (const r of all) byKey.set(r.product_key, [...(byKey.get(r.product_key) ?? []), r])
    const out: ProductDoc[] = []
    const gone: string[] = []
    for (const k of keys) {
      const d = buildDoc(k, byKey.get(k) ?? [])
      if (d) out.push(d)
      else gone.push(docId(k))
    }
    if (out.length) await meili('POST', `/indexes/${PRODUCTS_INDEX}/documents`, out, 60_000)
    if (gone.length) await meili('POST', `/indexes/${PRODUCTS_INDEX}/documents/delete-batch`, gone, 30_000)
    await run(req, sql`UPDATE store_offers SET search_synced_at = now() WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    docs += out.length
    removed += gone.length
    rowsDone += rows.length
  }
  // products no store has listed for 3 days leave the index (their rows stay in Postgres with the history)
  const cutoff = Math.floor(Date.now() / 1000) - FRESH_DAYS * 86_400
  try {
    await meili('POST', `/indexes/${PRODUCTS_INDEX}/documents/delete`, { filter: `updated_at < ${cutoff}` }, 30_000)
  } catch {}
  const stats = await meili<{ numberOfDocuments: number }>('GET', `/indexes/${PRODUCTS_INDEX}/stats`)
  await run(
    req,
    sql`UPDATE search_sync_state SET last_sync_at = now(), last_sync_docs = ${docs}, last_error = NULL, index_docs = ${stats.numberOfDocuments}, last_reindex_at = CASE WHEN ${Boolean(opts.reindex)} THEN now() ELSE last_reindex_at END,
      index_docs_yesterday = CASE WHEN yesterday_at IS NULL OR yesterday_at < now() - interval '24 hours' THEN index_docs ELSE index_docs_yesterday END,
      yesterday_at = CASE WHEN yesterday_at IS NULL OR yesterday_at < now() - interval '24 hours' THEN now() ELSE yesterday_at END WHERE id = 1`,
  )
  return { rows: rowsDone, docs, removed, indexDocs: stats.numberOfDocuments, ms: Date.now() - started }
}

export async function searchStatus(req: PayloadRequest) {
  let meiliInfo: Record<string, unknown> = { healthy: false }
  try {
    const h = await meili<{ status: string }>('GET', '/health', undefined, 2000)
    const s = await meili<{ databaseSize: number; usedDatabaseSize: number }>('GET', '/stats', undefined, 2000)
    const i = await meili<{ numberOfDocuments: number; isIndexing: boolean }>('GET', `/indexes/${PRODUCTS_INDEX}/stats`, undefined, 2000)
    meiliInfo = { healthy: h.status === 'available', dbBytes: s.databaseSize, docs: i.numberOfDocuments, indexing: i.isIndexing }
  } catch (e) {
    meiliInfo = { healthy: false, error: String((e as Error).message).slice(0, 120) }
  }
  const [state] = await run(req, sql`SELECT * FROM search_sync_state WHERE id = 1`)
  const [tot] = await run(req, sql`SELECT count(*)::int AS offers, count(*) FILTER (WHERE search_synced_at > now() - interval '24 hours')::int AS synced_24h, count(*) FILTER (WHERE search_synced_at IS NULL OR search_synced_at < updated_at)::int AS pending, count(*) FILTER (WHERE price_changed_at > now() - interval '24 hours')::int AS price_changes_24h FROM store_offers`)
  const stores = await run(req, sql`SELECT store, count(*)::int AS listings, max(seen_at) AS last_seen, count(*) FILTER (WHERE price_changed_at > now() - interval '24 hours')::int AS price_changes_24h FROM store_offers GROUP BY store ORDER BY store`)
  const failed = await run(req, sql`SELECT store, at, page, error FROM search_crawl_runs WHERE ok = false AND at > now() - interval '24 hours' ORDER BY at DESC LIMIT 20`)
  return { meili: meiliInfo, configured: meiliConfigured(), sync: state ?? null, offers: tot ?? null, stores, failedCrawls: failed, now: new Date().toISOString() }
}

export const searchEndpoints: Endpoint[] = [
  {
    path: '/pipeline/search/sync',
    method: 'post',
    handler: async (req) => {
      const denied = requireBotOrAdmin(req)
      if (denied) return denied
      if (!meiliConfigured()) return json({ ok: false, error: 'MEILI_MASTER_KEY not set' }, 503)
      let body: { reindex?: boolean } = {}
      try {
        body = (await req.json!()) ?? {}
      } catch {}
      try {
        return json({ ok: true, ...(await syncProducts(req, { reindex: Boolean(body.reindex) })) })
      } catch (e) {
        const msg = String((e as Error).message).slice(0, 300)
        await run(req, sql`UPDATE search_sync_state SET last_error = ${msg} WHERE id = 1`).catch(() => {})
        return json({ ok: false, error: msg }, 502)
      }
    },
  },
  {
    path: '/pipeline/search/status',
    method: 'get',
    handler: async (req) => {
      const denied = requireBotOrAdmin(req)
      if (denied) return denied
      return json(await searchStatus(req))
    },
  },
]
