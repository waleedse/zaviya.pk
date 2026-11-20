import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { PRODUCTS_INDEX } from '@zaviya/shared'
import { meili, meiliConfigured } from './meili'

type Row = Record<string, any>
const run = async (payload: Payload, q: ReturnType<typeof sql>): Promise<Row[]> => ((await payload.db.drizzle.execute(q)) as unknown as { rows?: Row[] }).rows ?? []

/** Everything the admin view, the watchdog and the 6-hour report read (docs/PRODUCT-SEARCH.md section 6) */
export async function searchStatus(payload: Payload) {
  let meiliInfo: Record<string, unknown> = { healthy: false }
  try {
    const h = await meili<{ status: string }>('GET', '/health', undefined, 2000)
    const s = await meili<{ databaseSize: number }>('GET', '/stats', undefined, 2000)
    const i = await meili<{ numberOfDocuments: number; isIndexing: boolean }>('GET', `/indexes/${PRODUCTS_INDEX}/stats`, undefined, 2000)
    meiliInfo = { healthy: h.status === 'available', dbBytes: s.databaseSize, docs: i.numberOfDocuments, indexing: i.isIndexing }
  } catch (e) {
    meiliInfo = { healthy: false, error: String((e as Error).message).slice(0, 120) }
  }
  const [state] = await run(payload, sql`SELECT * FROM search_sync_state WHERE id = 1`)
  const [tot] = await run(payload, sql`SELECT count(*)::int AS offers, count(*) FILTER (WHERE search_synced_at > now() - interval '24 hours')::int AS synced_24h, count(*) FILTER (WHERE search_synced_at IS NULL OR search_synced_at < updated_at)::int AS pending, count(*) FILTER (WHERE price_changed_at > now() - interval '24 hours')::int AS price_changes_24h, count(*) FILTER (WHERE first_seen_at > now() - interval '24 hours')::int AS new_24h, max(seen_at) AS last_seen FROM store_offers`)
  const stores = await run(payload, sql`SELECT h.host, h.name, h.platform, h.state, h.listings, h.last_crawl_at, h.next_crawl_at, h.fail_count, h.last_error, (SELECT count(*)::int FROM store_offers o WHERE o.store = h.slug) AS offers, (SELECT count(*)::int FROM store_offers o WHERE o.store = h.slug AND o.price_changed_at > now() - interval '24 hours') AS price_changes_24h FROM search_hosts h WHERE h.state IN ('active','paused') ORDER BY 6 DESC LIMIT 200`)
  const [hostCounts] = await run(payload, sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE state='active')::int AS active, count(*) FILTER (WHERE state='candidate' OR state='probing')::int AS queue, count(*) FILTER (WHERE state='rejected')::int AS rejected, count(*) FILTER (WHERE state='paused')::int AS paused, count(*) FILTER (WHERE found_at > now() - interval '24 hours')::int AS new_24h FROM search_hosts`)
  const failed = await run(payload, sql`SELECT host, last_crawl_at, fail_count, last_error FROM search_hosts WHERE fail_count > 0 ORDER BY fail_count DESC LIMIT 20`)
  const groups = await run(payload, sql`SELECT "group", count(*)::int AS n FROM store_offers GROUP BY 1 ORDER BY 2 DESC`)
  const [labels] = await run(payload, sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE first_seen_at > now() - interval '24 hours')::int AS new_24h FROM search_label_map`)
  const reports = await run(payload, sql`SELECT at, stats FROM search_discovery_log ORDER BY id DESC LIMIT 8`)
  return { meili: meiliInfo, configured: meiliConfigured(), sync: state ?? null, offers: tot ?? null, hosts: hostCounts ?? null, stores, failedCrawls: failed, groups, labels: labels ?? null, reports, now: new Date().toISOString() }
}

/** The 6-hour discovery report: new stores, categories (labels), products and directions since the last report */
export async function discoveryReport(payload: Payload) {
  const [h] = await run(payload, sql`SELECT count(*) FILTER (WHERE found_at > now() - interval '6 hours')::int AS new_hosts, count(*) FILTER (WHERE state='active')::int AS active_hosts, count(*) FILTER (WHERE state='rejected' AND last_probe_at > now() - interval '6 hours')::int AS rejected_6h, count(*) FILTER (WHERE state='active' AND last_probe_at > now() - interval '6 hours')::int AS activated_6h FROM search_hosts`)
  const [p] = await run(payload, sql`SELECT count(*) FILTER (WHERE first_seen_at > now() - interval '6 hours')::int AS new_products, count(*)::int AS total_products, count(*) FILTER (WHERE "group" = 'other')::int AS uncategorised FROM store_offers`)
  const [l] = await run(payload, sql`SELECT count(*) FILTER (WHERE first_seen_at > now() - interval '6 hours')::int AS new_labels, count(*)::int AS total_labels FROM search_label_map`)
  const newLabels = (await run(payload, sql`SELECT label FROM search_label_map WHERE first_seen_at > now() - interval '6 hours' ORDER BY products DESC LIMIT 10`)).map((r) => String(r.label))
  const topNew = await run(payload, sql`SELECT store, count(*)::int AS n FROM store_offers WHERE first_seen_at > now() - interval '6 hours' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`)
  const stats = { ...h, ...p, ...l, newLabels, topNewStores: topNew }
  await run(payload, sql`INSERT INTO search_discovery_log (stats) VALUES (${JSON.stringify(stats)}::jsonb)`)
  return stats
}
