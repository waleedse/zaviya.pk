import type { Endpoint, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'
import { PRODUCTS_INDEX, docId, offerGroup, offerSlug, productKey, productsIndexSettings, type ProductDoc } from '@zaviya/shared'
import { keys as matchKeys, matchOffer } from './offers'
import { meili, meiliConfigured, waitTask } from '@/lib/search/meili'
import { json, parseJson, requireBotOrAdmin } from './helpers'

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

let names: { at: number; map: Map<string, string> } | null = null
async function loadNames(req: PayloadRequest) {
  if (names && Date.now() - names.at < 5 * 60_000) return names.map
  const rows = await run(req, sql`SELECT slug, name FROM search_hosts`)
  names = { at: Date.now(), map: new Map(rows.map((r) => [String(r.slug), String(r.name)])) }
  return names.map
}

export function buildDoc(key: string, rows: Row[], storeName: (slug: string) => string = (x) => x): ProductDoc | null {
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
  const nameMap = await loadNames(req)
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
      const d = buildDoc(k, byKey.get(k) ?? [], (x) => nameMap.get(x) ?? x)
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
  const stores = await run(req, sql`SELECT o.store, count(*)::int AS listings, max(o.seen_at) AS last_seen, count(*) FILTER (WHERE o.price_changed_at > now() - interval '24 hours')::int AS price_changes_24h, max(h.state) AS state, max(h.fail_count) AS fails, max(h.last_error) AS last_error FROM store_offers o LEFT JOIN search_hosts h ON h.slug = o.store GROUP BY o.store ORDER BY 2 DESC LIMIT 500`)
  const [hostCounts] = await run(req, sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE state='active')::int AS active, count(*) FILTER (WHERE state='candidate')::int AS candidates, count(*) FILTER (WHERE state='rejected')::int AS rejected, count(*) FILTER (WHERE found_at > now() - interval '24 hours')::int AS new_24h FROM search_hosts`)
  const failed = await run(req, sql`SELECT store, at, page, error FROM search_crawl_runs WHERE ok = false AND at > now() - interval '24 hours' ORDER BY at DESC LIMIT 20`)
  return { meili: meiliInfo, configured: meiliConfigured(), sync: state ?? null, offers: tot ?? null, stores, failedCrawls: failed, hosts: hostCounts ?? null, now: new Date().toISOString() }
}

/** Never a candidate: comparison sites (standing rule), marketplaces and platforms that block bots, social networks, search engines, reference sites */
const BLOCKED = /(^|\.)(priceoye|qeemat|whatmobile|pricemeter|mega|pricehunt|pricekar|daraz|olx|pakwheels|facebook|instagram|youtube|twitter|x|tiktok|linkedin|pinterest|wikipedia|google|bing|yahoo|amazon|ebay|alibaba|aliexpress|temu|shein|walmart|etsy|reddit|quora|medium|blogspot|wordpress|wixsite|myshopify|shopify|apple|microsoft|github|whatsapp|t)\.(com|pk|net|org|co|com\.pk|me)$/
const HOST_RE = /^(?=.{4,100}$)([a-z0-9-]+\.)+[a-z]{2,24}$/
const hostSlug = (host: string) => host.replace(/^www\./, '').replace(/\.(com\.pk|pk|com|net|org|store|shop)$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || host.replace(/[^a-z0-9]+/g, '-')
const hostName = (host: string) => hostSlug(host).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const HostsBody = z.object({ hosts: z.array(z.object({ host: z.string().max(120), source: z.string().max(40).optional() })).min(1).max(2000) })
const ResultBody = z.object({
  host: z.string(),
  state: z.enum(['candidate', 'probing', 'active', 'rejected', 'paused']).optional(),
  platform: z.enum(['shopify', 'woo']).optional(),
  page: z.number().int().min(1).max(5000).optional(),
  cycleDone: z.boolean().optional(),
  listings: z.number().int().min(0).optional(),
  error: z.string().max(300).nullable().optional(),
})
const ItemBody = z.object({
  store: z.string().min(1).max(60),
  items: z
    .array(
      z.object({
        handle: z.string().min(1).max(200),
        title: z.string().min(2).max(200),
        brand: z.string().max(60).optional(),
        productType: z.string().max(120).optional(),
        url: z.string().url().max(500),
        imageUrl: z.string().url().max(500).optional(),
        pricePkr: z.number().int().positive().max(50_000_000),
        listPricePkr: z.number().int().positive().max(50_000_000).nullable().optional(),
        inStock: z.boolean().optional(),
        model: z.string().max(80).optional(),
        gtin: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(500),
})

export const searchEndpoints: Endpoint[] = [
  {
    // Candidate stores found by the worker (Common Crawl, links, probes). New hosts only; known ones are left alone.
    path: '/pipeline/search/hosts',
    method: 'post',
    handler: async (req) => {
      const denied = requireBotOrAdmin(req)
      if (denied) return denied
      const parsed = await parseJson(req, HostsBody)
      if ('error' in parsed) return parsed.error
      const seen = new Set<string>()
      const rows = parsed.data.hosts
        .map((h) => ({ host: h.host.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''), source: h.source ?? 'crawl' }))
        .filter((h) => HOST_RE.test(h.host) && !BLOCKED.test(h.host) && !seen.has(h.host) && seen.add(h.host))
      if (!rows.length) return json({ ok: true, added: 0 })
      const res = await run(
        req,
        sql`INSERT INTO search_hosts (host, slug, name, base_url, source) VALUES ${sql.join(rows.map((h) => sql`(${h.host}, ${hostSlug(h.host)}, ${hostName(h.host)}, ${`https://${h.host}`}, ${h.source})`), sql`, `)} ON CONFLICT DO NOTHING RETURNING host`,
      ).catch(() => [])
      return json({ ok: true, added: res.length })
    },
  },
  {
    // Work for the worker: hosts to probe, and hosts whose crawl is due (leased for 20 minutes so two ticks never read one store at once)
    path: '/pipeline/search/work',
    method: 'get',
    handler: async (req) => {
      const denied = requireBotOrAdmin(req)
      if (denied) return denied
      const sp = new URL(req.url!).searchParams
      const probe = Math.min(Number(sp.get('probe')) || 0, 50)
      const crawl = Math.min(Number(sp.get('crawl')) || 0, 20)
      const toProbe = probe
        ? await run(req, sql`UPDATE search_hosts SET state = 'probing', last_probe_at = now() WHERE host IN (SELECT host FROM search_hosts WHERE state = 'candidate' OR (state = 'probing' AND last_probe_at < now() - interval '30 minutes') ORDER BY found_at LIMIT ${probe} FOR UPDATE SKIP LOCKED) RETURNING host, base_url`)
        : []
      const toCrawl = crawl
        ? await run(req, sql`UPDATE search_hosts SET next_crawl_at = now() + interval '20 minutes' WHERE host IN (SELECT host FROM search_hosts WHERE state = 'active' AND (next_crawl_at IS NULL OR next_crawl_at <= now()) ORDER BY next_crawl_at NULLS FIRST LIMIT ${crawl} FOR UPDATE SKIP LOCKED) RETURNING host, slug, base_url, platform, crawl_page`)
        : []
      const labelN = Math.min(Number(sp.get('labels')) || 0, 30)
      const labels = labelN ? (await run(req, sql`SELECT label FROM search_label_map WHERE products >= 3 ORDER BY random() LIMIT ${labelN}`)).map((r) => String(r.label)) : []
      return json({ probe: toProbe, crawl: toCrawl, labels })
    },
  },
  {
    path: '/pipeline/search/host-result',
    method: 'post',
    handler: async (req) => {
      const denied = requireBotOrAdmin(req)
      if (denied) return denied
      const parsed = await parseJson(req, ResultBody)
      if ('error' in parsed) return parsed.error
      const r = parsed.data
      // a failing store is retried later and paused after 6 failures in a row; a finished cycle schedules the next daily read
      await run(
        req,
        sql`UPDATE search_hosts SET
          state = coalesce(${r.state ?? null}, CASE WHEN ${r.error != null} AND fail_count + 1 >= 6 THEN 'paused' ELSE state END),
          platform = coalesce(${r.platform ?? null}, platform),
          crawl_page = coalesce(${r.page ?? null}, crawl_page),
          listings = listings + coalesce(${r.listings ?? 0}, 0),
          fail_count = CASE WHEN ${r.error != null} THEN fail_count + 1 ELSE 0 END,
          last_error = ${r.error ?? null},
          last_crawl_at = CASE WHEN ${r.listings != null} THEN now() ELSE last_crawl_at END,
          next_crawl_at = CASE WHEN ${r.cycleDone === true} THEN now() + interval '23 hours' WHEN ${r.error != null} THEN now() + interval '3 hours' WHEN ${r.page != null} THEN now() + interval '1 minute' ELSE next_crawl_at END
          WHERE host = ${r.host}`,
      )
      return json({ ok: true })
    },
  },
  {
    // Bulk import of one page of listings from one store: one upsert statement, price history on first sight and on every change
    path: '/pipeline/search/import',
    method: 'post',
    handler: async (req) => {
      const denied = requireBotOrAdmin(req)
      if (denied) return denied
      const parsed = await parseJson(req, ItemBody)
      if ('error' in parsed) return parsed.error
      const { store } = parsed.data
      const k = await matchKeys(req)
      const bySlug = new Map<string, (typeof parsed.data.items)[number] & { slug: string }>()
      for (const it of parsed.data.items) bySlug.set(offerSlug(store, it.handle), { ...it, slug: offerSlug(store, it.handle) })
      const rows = [...bySlug.values()].map((it) => {
        const group = offerGroup(it.title, it.productType ?? '')
        const m = matchOffer({ title: it.title, brand: it.brand, group, model: it.model }, k)
        return sql`(${it.slug}, ${store}, ${it.title}, ${it.brand ?? null}, ${group}, ${it.url}, ${it.imageUrl ?? null}, ${it.pricePkr}::numeric, ${it.listPricePkr ?? null}::numeric, ${it.inStock ?? null}::boolean, ${it.model ?? null}, ${m?.kind ?? null}, ${m?.slug ?? null}, ${it.productType ?? null}, ${it.gtin ?? null})`
      })
      const res = await run(
        req,
        sql`INSERT INTO store_offers (slug, store, title, brand, "group", url, image_url, price_pkr, list_price_pkr, in_stock, model, match_kind, match_slug, category_path, gtin, seen_at, first_seen_at, price_changed_at, updated_at, created_at)
          SELECT v.*, now(), now(), now(), now(), now() FROM (VALUES ${sql.join(rows, sql`, `)}) AS v(slug, store, title, brand, grp, url, image_url, price, list_price, in_stock, model, match_kind, match_slug, category_path, gtin)
          ON CONFLICT (slug) DO UPDATE SET
            title = EXCLUDED.title, brand = EXCLUDED.brand, "group" = EXCLUDED."group", url = EXCLUDED.url,
            image_url = coalesce(EXCLUDED.image_url, store_offers.image_url),
            prev_price_pkr = CASE WHEN EXCLUDED.price_pkr IS DISTINCT FROM store_offers.price_pkr AND store_offers.price_pkr IS NOT NULL THEN store_offers.price_pkr ELSE store_offers.prev_price_pkr END,
            price_changed_at = CASE WHEN EXCLUDED.price_pkr IS DISTINCT FROM store_offers.price_pkr AND store_offers.price_pkr IS NOT NULL THEN now() ELSE store_offers.price_changed_at END,
            price_pkr = EXCLUDED.price_pkr, list_price_pkr = EXCLUDED.list_price_pkr, in_stock = EXCLUDED.in_stock, model = EXCLUDED.model,
            match_kind = EXCLUDED.match_kind, match_slug = EXCLUDED.match_slug, category_path = coalesce(EXCLUDED.category_path, store_offers.category_path),
            gtin = coalesce(EXCLUDED.gtin, store_offers.gtin), first_seen_at = coalesce(store_offers.first_seen_at, store_offers.created_at),
            seen_at = now(),
            -- only a real change makes the row "dirty" for the Meilisearch sync (re-reading an unchanged listing costs nothing downstream)
            updated_at = CASE WHEN EXCLUDED.price_pkr IS DISTINCT FROM store_offers.price_pkr OR EXCLUDED.in_stock IS DISTINCT FROM store_offers.in_stock OR EXCLUDED.title IS DISTINCT FROM store_offers.title OR store_offers.seen_at < now() - interval '1 day' THEN now() ELSE store_offers.updated_at END
          RETURNING slug, price_pkr, list_price_pkr, in_stock, (xmax = 0) AS inserted, (xmax <> 0 AND price_changed_at = now()) AS changed`,
      )
      const hist = res.filter((r) => r.inserted || r.changed)
      if (hist.length) {
        await run(req, sql`INSERT INTO offer_price_history (offer_slug, price_pkr, list_price_pkr, in_stock) VALUES ${sql.join(hist.map((r) => sql`(${r.slug}, ${r.price_pkr}::numeric, ${r.list_price_pkr}::numeric, ${r.in_stock}::boolean)`), sql`, `)}`)
      }
      // every distinct store category label is recorded once (classification works per label, not per product: docs/PRODUCT-SEARCH.md section 11)
      const labels = new Map<string, number>()
      for (const it of bySlug.values()) if (it.productType) labels.set(it.productType, (labels.get(it.productType) ?? 0) + 1)
      if (labels.size) {
        await run(req, sql`INSERT INTO search_label_map (store, label, category, by, products) VALUES ${sql.join([...labels].map(([l, n]) => sql`(${store}, ${l}, ${offerGroup(l, l)}, 'rule', ${n})`), sql`, `)} ON CONFLICT (store, label) DO UPDATE SET products = search_label_map.products + EXCLUDED.products`)
      }
      return json({ ok: true, received: bySlug.size, inserted: res.filter((r) => r.inserted).length, changed: res.filter((r) => r.changed).length })
    },
  },
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
