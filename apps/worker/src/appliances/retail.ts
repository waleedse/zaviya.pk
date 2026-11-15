import { OfferImportItemSchema, RETAIL_STORES, offerGroup, type OfferImportItem } from '@zaviya/shared'
import { logger } from '../logger.js'
import { politeFetchText } from '../phones/catalog.js'
import { decodeEntities } from '../phones/highlights.js'
import { modelFrom } from './collect.js'

/**
 * Store offers crawl (15 Nov 2026, Waleed: "the scraper should work 24 hours and keep scraping").
 * Every tick reads ONE page (250 listings) of ONE store's public Shopify feed and posts it to
 * /api/pipeline/offers/import; a cursor in Redis moves page by page and store by store, so the crawl never stops
 * and never bursts. Robots.txt and Zaviya's own user agent via politeFetchText. Only stores in RETAIL_STORES.
 */

export const RETAIL_PAGE_SIZE = 250
export const RETAIL_TICK_MS = 5 * 60_000
const CURSOR_KEY = 'zaviya:retail:cursor'

interface ShopifyProduct {
  title?: string
  handle?: string
  vendor?: string
  product_type?: string
  images?: { src?: string }[]
  variants?: { price?: string; compare_at_price?: string | null; available?: boolean }[]
}

const pkr = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 100 && n <= 50_000_000 ? Math.round(n) : null
}

const imageOf = (src: string | undefined) => (!src ? undefined : src.startsWith('//') ? `https:${src}` : src.startsWith('http') ? src : undefined)

/** Shopify listings -> offers. Listings without a price or a handle are skipped; every offer is validated by the server schema. */
export function parseRetailProducts(products: ShopifyProduct[], store: (typeof RETAIL_STORES)[number]): OfferImportItem[] {
  const out: OfferImportItem[] = []
  for (const p of products) {
    const title = decodeEntities(String(p.title ?? '')).replace(/\s+/g, ' ').trim()
    if (!title || !p.handle) continue
    const variants = p.variants ?? []
    const prices = variants.map((v) => pkr(v.price)).filter((n): n is number => n != null)
    if (!prices.length) continue
    const price = Math.min(...prices)
    const cheapest = variants.find((v) => pkr(v.price) === price)
    const list = pkr(cheapest?.compare_at_price)
    const vendor = decodeEntities(String(p.vendor ?? '')).trim()
    const parsed = OfferImportItemSchema.safeParse({
      store: store.slug,
      handle: p.handle,
      title: title.slice(0, 200),
      // store names as vendor ("Telemart") are not the brand
      brand: vendor && !new RegExp(`^${store.name.split(' ')[0]!}\\b`, 'i').test(vendor) ? vendor.slice(0, 60) : undefined,
      group: offerGroup(title, p.product_type ?? ''),
      url: `${store.base}/products/${p.handle}`,
      imageUrl: imageOf(p.images?.[0]?.src),
      pricePkr: price,
      listPricePkr: list && list > price ? list : null,
      inStock: variants.some((v) => v.available !== false),
      model: modelFrom(title),
    })
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

export interface Cursor {
  store: number
  page: number
}

/** Next cursor after reading a page with `count` listings: next page, or the next store's first page */
export function nextCursor(c: Cursor, count: number, stores = RETAIL_STORES.length): Cursor {
  return count >= RETAIL_PAGE_SIZE && c.page < 200 ? { store: c.store, page: c.page + 1 } : { store: (c.store + 1) % stores, page: 1 }
}

type Request = <T>(method: string, path: string, body?: unknown, opts?: { timeoutMs?: number; retries?: number }) => Promise<T>
interface Kv {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
}

export async function runRetailTick(deps: { request: Request; kv: Kv; fetchText?: (url: string) => Promise<string | null> }) {
  let cursor: Cursor = { store: 0, page: 1 }
  try {
    const raw = await deps.kv.get(CURSOR_KEY)
    if (raw) cursor = JSON.parse(raw) as Cursor
  } catch {}
  if (!(cursor.store >= 0 && cursor.store < RETAIL_STORES.length)) cursor = { store: 0, page: 1 }
  const store = RETAIL_STORES[cursor.store]!
  const body = await (deps.fetchText ?? politeFetchText)(`${store.base}/products.json?limit=${RETAIL_PAGE_SIZE}&page=${cursor.page}`)
  let products: ShopifyProduct[] = []
  try {
    products = body ? ((JSON.parse(body) as { products?: ShopifyProduct[] }).products ?? []) : []
  } catch {
    products = []
  }
  const items = parseRetailProducts(products, store)
  let result: { matched?: number; changed?: number } = {}
  for (let i = 0; i < items.length; i += RETAIL_PAGE_SIZE) {
    const r = await deps.request<{ matched: number; changed: number }>('POST', '/api/pipeline/offers/import', { items: items.slice(i, i + RETAIL_PAGE_SIZE) }, { timeoutMs: 120_000 })
    result = { matched: (result.matched ?? 0) + r.matched, changed: (result.changed ?? 0) + r.changed }
  }
  const next = nextCursor(cursor, products.length)
  await deps.kv.set(CURSOR_KEY, JSON.stringify(next))
  const out = { store: store.slug, page: cursor.page, listings: products.length, offers: items.length, ...result, next }
  logger.info(out, 'store offers: page read')
  return out
}
