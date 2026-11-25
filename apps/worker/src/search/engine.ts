import { logger } from '../logger.js'
import { politeJson } from './http.js'
import { seedFromBrands, seedFromBrowser, seedFromCommonCrawl, seedFromSearchApi } from './seed.js'
import { probeJsonLd, readProductPage, sitemapProductUrls } from './jsonld.js'
import { parseShopify, parseWoo, type Listing } from './parsers.js'

/**
 * Automatic product search engine (docs/PRODUCT-SEARCH.md sections 9 and 11). Nothing here is a hand-made store list:
 *   seed   candidate shops from Common Crawl, the official Google Custom Search API (category queries), and links on pages we read
 *   probe  robots.txt, currency PKR (Shopify /meta.json, Woo currency_code), a real product feed -> the host becomes active (any domain, not only .pk)
 *   crawl  every active host page by page, all day; a finished cycle is scheduled again 23 hours later
 */

type Request = <T>(method: string, path: string, body?: unknown, opts?: { timeoutMs?: number; retries?: number }) => Promise<T>
interface Kv {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
}

const PAGE = 250
const MAX_PAGES_PER_TICK = 8
export const SEARCH_TICK_MS = 60_000
const TICK_BUDGET_MS = 50_000

interface ProbeHost { host: string; base_url: string }
interface CrawlHost { host: string; slug: string; base_url: string; platform: 'shopify' | 'woo' | 'jsonld'; crawl_page: number }

/** Probe: is this an online shop that sells in PKR and publishes a public product feed we may read? */
export async function probeHost(h: ProbeHost): Promise<{ state: 'active' | 'rejected'; platform?: 'shopify' | 'woo' | 'jsonld'; error?: string }> {
  const base = h.base_url.replace(/\/$/, '')
  const meta = await politeJson<{ currency?: string }>(`${base}/meta.json`)
  // a name that does not resolve (most brand guesses) costs one request, not three
  if (!meta.ok && meta.status === 0 && /fetch failed|ENOTFOUND|timeout|ECONN/i.test(meta.error)) return { state: 'rejected', error: 'unreachable' }
  if (meta.ok && meta.data.currency) {
    if (meta.data.currency !== 'PKR') {
      // some shops answer for another market until asked for Pakistan
      const pk = await politeJson<{ products?: { variants?: { price?: string }[] }[] }>(`${base}/products.json?limit=1&country=PK`)
      if (!pk.ok || !pk.data.products?.length) return { state: 'rejected', error: `currency ${meta.data.currency}` }
    }
    const feed = await politeJson<{ products?: unknown[] }>(`${base}/products.json?limit=1&country=PK`)
    if (feed.ok && feed.data.products?.length) return { state: 'active', platform: 'shopify' }
  }
  const woo = await politeJson<{ prices?: { currency_code?: string } }[]>(`${base}/wp-json/wc/store/v1/products?per_page=1`)
  if (woo.ok && Array.isArray(woo.data) && woo.data.length && woo.data[0]?.prices?.currency_code === 'PKR') return { state: 'active', platform: 'woo' }
  if (await probeJsonLd(base).catch(() => false)) return { state: 'active', platform: 'jsonld' }
  return { state: 'rejected', error: 'no public PKR product feed' }
}

/** Sitemap + product pages: 25 URLs a tick, the cursor walks the sitemap, a finished walk is a finished cycle */
async function crawlJsonLd(h: CrawlHost, deadline: number, request: Request) {
  const urls = await sitemapProductUrls(h.base_url)
  let offset = Math.max(0, (h.crawl_page || 1) - 1)
  const items: Awaited<ReturnType<typeof readProductPage>>['listing'][] = []
  let n = 0
  for (; offset < urls.length && n < 25 && Date.now() < deadline; offset++, n++) {
    const r = await readProductPage(urls[offset]!)
    if (r.listing) items.push(r.listing)
  }
  const real = items.filter((i): i is NonNullable<typeof i> => Boolean(i))
  if (real.length) await request('POST', '/api/pipeline/search/import', { store: h.slug, items: real }, { timeoutMs: 120_000 })
  if (!urls.length) return { page: 1, listings: 0, cycleDone: true, error: 'sitemap empty' }
  return offset >= urls.length ? { page: 1, listings: real.length, cycleDone: true } : { page: offset + 1, listings: real.length, cycleDone: false }
}

export async function crawlPages(h: CrawlHost, name: string, deadline: number, request: Request): Promise<{ page: number; listings: number; cycleDone?: boolean; error?: string }> {
  if (h.platform === 'jsonld') return crawlJsonLd(h, deadline, request)
  let page = h.crawl_page || 1
  let listings = 0
  for (let n = 0; n < MAX_PAGES_PER_TICK && Date.now() < deadline; n++) {
    const url = h.platform === 'woo' ? `${h.base_url}/wp-json/wc/store/v1/products?per_page=100&page=${page}` : `${h.base_url}/products.json?limit=${PAGE}&page=${page}&country=PK`
    const r = await politeJson<unknown>(url)
    if (!r.ok) {
      // WooCommerce answers 400 past the last page
      if (h.platform === 'woo' && r.status === 400 && page > 1) return { page: 1, listings, cycleDone: true }
      return { page, listings, error: r.error }
    }
    const raw = h.platform === 'woo' ? (r.data as unknown[]) : ((r.data as { products?: unknown[] }).products ?? [])
    const items: Listing[] = h.platform === 'woo' ? parseWoo(raw as never) : parseShopify(raw as never, h.base_url, name)
    for (let i = 0; i < items.length; i += 250) {
      await request('POST', '/api/pipeline/search/import', { store: h.slug, items: items.slice(i, i + 250) }, { timeoutMs: 120_000 })
    }
    listings += items.length
    const pageSize = h.platform === 'woo' ? 100 : PAGE
    if (raw.length < pageSize || page >= 400) return { page: 1, listings, cycleDone: true }
    page++
  }
  return { page, listings, cycleDone: false }
}

export async function runSearchTick(deps: { request: Request; kv: Kv; bridge?: Parameters<typeof seedFromBrowser>[0]['bridge'] }) {
  const deadline = Date.now() + TICK_BUDGET_MS
  const { request } = deps
  const work = await request<{ probe: ProbeHost[]; crawl: (CrawlHost & { name?: string })[] }>('GET', '/api/pipeline/search/work?probe=40&crawl=10', undefined, { timeoutMs: 30_000 })
  const out = { probed: 0, activated: 0, crawled: 0, listings: 0, errors: 0 }
  const jobs: Promise<void>[] = []
  // different hosts are probed side by side (the 1.5 s spacing applies per host)
  jobs.push(
    (async () => {
      const queue = [...work.probe]
      const lane = async () => {
        for (let h = queue.shift(); h && Date.now() < deadline; h = queue.shift()) {
          const r = await probeHost(h).catch(() => ({ state: 'rejected' as const, error: 'probe failed' }))
          out.probed++
          if (r.state === 'active') out.activated++
          await request('POST', '/api/pipeline/search/host-result', { host: h.host, state: r.state, platform: (r as { platform?: string }).platform, error: r.error ?? null }, { timeoutMs: 30_000 }).catch(() => {})
        }
      }
      await Promise.all(Array.from({ length: 8 }, lane))
    })(),
  )
  for (const h of work.crawl) {
    jobs.push(
      (async () => {
        const name = h.slug
        const r = await crawlPages(h, name, deadline, request)
        out.crawled++
        out.listings += r.listings
        if (r.error) out.errors++
        await request('POST', '/api/pipeline/search/host-result', { host: h.host, page: r.page, listings: r.listings, cycleDone: r.cycleDone, error: r.error ?? null }, { timeoutMs: 30_000 })
      })().catch((e) => {
        out.errors++
        logger.warn({ host: h.host, err: String(e) }, 'search crawl failed')
      }),
    )
  }
  // seeding is throttled: Common Crawl every 5th tick, the search API every 20th (about 70 queries a day)
  const tick = Number((await deps.kv.get('zaviya:search:tick')) ?? '0') + 1
  await deps.kv.set('zaviya:search:tick', String(tick))
  if (tick % 5 === 0) jobs.push(seedFromCommonCrawl(deps).then(() => {}))
  // brand names -> candidate shop domains, every 2nd tick (the probe queue drains 40 a tick)
  if (tick % 2 === 0) jobs.push(seedFromBrands(deps).then(() => {}))
  if (tick % 20 === 0) jobs.push(seedFromSearchApi(deps).then(() => {}))
  // browser searches: about one every 20 minutes at most (the seed itself caps 60 a day)
  if (deps.bridge && tick % 20 === 10) jobs.push(seedFromBrowser({ ...deps, bridge: deps.bridge }).then(() => {}))
  await Promise.all(jobs)
  logger.info(out, 'product search tick')
  return out
}
