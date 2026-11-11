import { ApplianceImportItemSchema, applianceSlug, classifyAppliance, type ApplianceCategorySlug, type ApplianceImportInput, type ApplianceSpec } from '@zaviya/shared'
import { logger } from '../logger.js'
import { makeCtx } from '../phones/catalog.js'
import { decodeEntities, pageTitle } from '../phones/highlights.js'
import { parseSamsungPdp } from '../phones/samsung.js'
import type { AdapterCtx } from '../phones/types.js'
import { WOO_STORES, fetchHyundai, fetchPbsHistory, fetchPbsSpi, fetchToyota, fetchWoo } from './sources.js'

/**
 * Home appliance prices (zaviya.pk/prices), added 5 Nov 2026.
 * Sources are only the brands' own Pakistan stores, read politely once a day with Zaviya's own user agent and robots.txt:
 *  - Shopify stores (Nasgas, Anex, West Point) publish a product feed at /products.json
 *  - Samsung Pakistan lists appliances in its sitemap; each product page carries a schema.org Product with the PKR price
 *  - since 6 Nov 2026 also motorcycles, cars and weekly grocery prices (sources.ts, docs/PRICE-ENGINE.md)
 * Brands that block us (Dawlance answers 403, Honda cars 403) or show no prices (Haier) are not read.
 */

type Request = <T>(method: string, path: string, body?: unknown, opts?: { timeoutMs?: number; retries?: number }) => Promise<T>

const SHOPIFY_STORES = [
  { brand: 'nasgas', base: 'https://www.nasgas.com' },
  { brand: 'anex', base: 'https://www.anex.pk' },
  { brand: 'westpoint', base: 'https://www.westpoint.pk' },
  { brand: 'gfc', base: 'https://gfcfans.com' },
] as const

const SHOPIFY_MAX_PAGES = 4

interface ShopifyVariant {
  price?: string
  compare_at_price?: string | null
  available?: boolean
  sku?: string | null
}
interface ShopifyProduct {
  title?: string
  handle?: string
  product_type?: string
  body_html?: string | null
  images?: { src?: string }[]
  variants?: ShopifyVariant[]
}

const toPkr = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= 500 && n <= 5_000_000 ? Math.round(n) : null
}

const stripHtml = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .trim()

/** Model codes such as "AG-2111", "DEG-15", "AR12TSHZGWK" */
export function modelFrom(title: string): string | undefined {
  return /\b([A-Z]{1,5}-?\d{2,5}[A-Z0-9-]*)\b/.exec(title)?.[1]
}

/** Which size facts make sense per category (a geyser's "1 kg copper" is not a washing capacity) */
const SIZE_RULES: Partial<Record<ApplianceCategorySlug, ('ton' | 'litre' | 'kg' | 'gallon')[]>> = {
  'air-conditioners': ['ton'],
  refrigerators: ['litre'],
  'washing-machines': ['kg'],
  'water-heaters': ['gallon', 'litre'],
  'water-dispensers': ['litre'],
  'microwave-ovens': ['litre'],
  'air-fryers': ['litre'],
  kettles: ['litre'],
  cookers: ['litre'],
  blenders: ['litre'],
}
const JUNK_LABEL = /^(description|features?|optional|note|notes|specifications?|key features|details|width|height|padding|margin|color|colour|font|border|style|display|text-align)$/i

/** A few facts every shopper looks for, read only from the brand's own text */
export function specsFrom(text: string, category?: ApplianceCategorySlug): ApplianceSpec[] {
  const out: ApplianceSpec[] = []
  const add = (label: string, value: string | undefined) => {
    if (value && !out.some((s) => s.label.toLowerCase() === label.toLowerCase())) out.push({ label, value: value.slice(0, 200) })
  }
  const t = text.replace(/\s+/g, ' ')
  const sizes = category ? (SIZE_RULES[category] ?? []) : []
  const first = (re: RegExp) => re.exec(t)?.[1]
  if (sizes.includes('ton')) add('Cooling capacity', first(/\b(\d(?:\.\d)?)\s*ton\b/i) ? `${first(/\b(\d(?:\.\d)?)\s*ton\b/i)} ton` : undefined)
  if (category === 'air-conditioners') add('Cooling (BTU)', first(/\b(\d{1,2},?\d{3})\s*BTU\b/i) ? `${first(/\b(\d{1,2},?\d{3})\s*BTU\b/i)} BTU` : undefined)
  if (sizes.includes('gallon')) add('Capacity', first(/\b(\d{1,3})\s*(?:gallons?|gal)\b/i) ? `${first(/\b(\d{1,3})\s*(?:gallons?|gal)\b/i)} gallons` : undefined)
  if (sizes.includes('litre')) add('Capacity', first(/\b(\d{1,3}(?:\.\d)?)\s*(?:litres?|liters?|ltrs?|L)\b/i) ? `${first(/\b(\d{1,3}(?:\.\d)?)\s*(?:litres?|liters?|ltrs?|L)\b/i)} litres` : undefined)
  if (sizes.includes('kg')) add('Washing capacity', first(/\b(\d{1,2}(?:\.\d)?)\s*kg\b/i) ? `${first(/\b(\d{1,2}(?:\.\d)?)\s*kg\b/i)} kg` : undefined)
  add('Power', first(/\b(\d{2,4})\s*(?:watts?|W)\b/) ? `${first(/\b(\d{2,4})\s*(?:watts?|W)\b/)} W` : undefined)
  if (/\binverter\b/i.test(t)) add('Inverter', 'Yes')
  if (/\bheat\s*(?:&|and)\s*cool|heating support|\bhot\s*(?:&|and)\s*cold\b/i.test(t)) add('Heating', 'Yes')
  add('Burners', first(/\b(\d)\s*burners?\b/i))
  add('Warranty', first(/\b(\d{1,2})\s*years?\s*(?:brand\s*)?warranty\b/i) ? `${first(/\b(\d{1,2})\s*years?\s*(?:brand\s*)?warranty\b/i)} years` : undefined)
  // "Label: value" lines from the description table, without page styling or marketing paragraphs
  for (const m of text.matchAll(/^\s*([A-Za-z][A-Za-z ()/]{2,28})\s*:\s*([^\n]{1,80})$/gm)) {
    if (out.length >= 12) break
    const label = m[1]!.trim()
    const value = m[2]!.trim()
    if (JUNK_LABEL.test(label) || /[;{}]|\bpx\b|#[0-9a-f]{3,6}\b/i.test(value) || value.split(' ').length > 10) continue
    add(label, value)
  }
  return out.slice(0, 12)
}

/** Shopify products -> appliances. Items we do not list (beauty, accessories) and items without a URL are skipped. */
export function parseShopifyProducts(products: ShopifyProduct[], brand: (typeof SHOPIFY_STORES)[number]['brand'], base: string): ApplianceImportInput[] {
  const out: ApplianceImportInput[] = []
  products.forEach((p, i) => {
    const title = decodeEntities(String(p.title ?? '')).replace(/\s+/g, ' ').trim()
    if (!title || !p.handle) return
    const category = classifyAppliance(title, p.product_type ?? '')
    if (!category) return
    const variants = p.variants ?? []
    const prices = variants.map((v) => toPkr(v.price)).filter((n): n is number => n != null)
    const price = prices.length ? Math.min(...prices) : null
    const cheapest = variants.find((v) => toPkr(v.price) === price)
    const text = `${title}\n${stripHtml(p.body_html ?? '')}`
    out.push({
      brand,
      category,
      name: title.slice(0, 160),
      model: modelFrom(title),
      pricePkr: price,
      listPricePkr: toPkr(cheapest?.compare_at_price),
      inStock: variants.some((v) => v.available !== false),
      imageUrl: p.images?.[0]?.src?.startsWith('http') ? p.images[0]!.src : p.images?.[0]?.src ? `https:${p.images[0]!.src}` : undefined,
      officialUrl: `${base}/products/${p.handle}`,
      specs: specsFrom(text, category),
      // the store's own order: earlier = more prominent
      popularity: Math.max(10, 70 - Math.floor(i / 5)),
    })
  })
  return out
}

export async function fetchShopify(ctx: AdapterCtx, store: (typeof SHOPIFY_STORES)[number]): Promise<ApplianceImportInput[]> {
  const products: ShopifyProduct[] = []
  for (let page = 1; page <= SHOPIFY_MAX_PAGES; page++) {
    const body = await ctx.fetchText(`${store.base}/products.json?limit=250&page=${page}`)
    if (!body) {
      if (page === 1) throw new Error(`${store.brand} product feed unavailable`)
      break
    }
    const batch = (JSON.parse(body) as { products?: ShopifyProduct[] }).products ?? []
    products.push(...batch)
    if (batch.length < 250) break
  }
  return parseShopifyProducts(products, store.brand, store.base)
}

// ---------- Samsung ----------

const SAMSUNG_SITEMAP = 'https://www.samsung.com/pk/da-sitemap.xml'
const SAMSUNG_CATEGORIES: Record<string, ApplianceCategorySlug> = {
  'air-conditioners': 'air-conditioners',
  refrigerators: 'refrigerators',
  'washers-and-dryers': 'washing-machines',
  'microwave-ovens': 'microwave-ovens',
  dishwashers: 'dishwashers',
}

/** Product pages only: /pk/<category>/<sub>/<model>/ */
export function samsungApplianceUrls(xml: string): { url: string; category: ApplianceCategorySlug; model: string }[] {
  const out: { url: string; category: ApplianceCategorySlug; model: string }[] = []
  for (const m of xml.matchAll(/<loc>(https:\/\/www\.samsung\.com\/pk\/([a-z-]+)\/[a-z0-9-]+\/([a-z0-9-]+)\/)<\/loc>/g)) {
    const category = SAMSUNG_CATEGORIES[m[2]!]
    if (!category || m[3] === 'all' || m[3]!.startsWith('all-')) continue
    // the model code is the last token of the last path part that looks like one ("ar9500t-ar50f12c1uhnsa-non-windfree-ar50f12c1nh2pm" -> AR50F12C1NH2PM)
    const codes = m[3]!.split('-').filter((t) => t.length >= 8 && /\d/.test(t) && /[a-z]/.test(t))
    const model = (codes.pop() ?? m[3]!).toUpperCase()
    out.push({ url: m[1]!, category, model })
  }
  return out
}

export async function fetchSamsungAppliances(ctx: AdapterCtx): Promise<ApplianceImportInput[]> {
  const xml = await ctx.fetchText(SAMSUNG_SITEMAP)
  if (!xml) throw new Error('samsung appliance sitemap unavailable')
  const out: ApplianceImportInput[] = []
  await ctx.mapLimit(samsungApplianceUrls(xml), async (u) => {
    const html = await ctx.fetchText(u.url)
    if (!html) return
    const pdp = parseSamsungPdp(html)
    if (!pdp) return
    // "<Samsung Digital Inverter AC 11,260 BTU> | Samsung Pakistan": the page title names the product; the schema name is only the model code
    const title = (pageTitle(html) ?? '').split('|')[0]!.replace(/^Samsung\s+/i, '').replace(/\s*Price in Pakistan\s*/i, ' ').replace(/\s+/g, ' ').trim()
    if (!title || /^error$/i.test(title)) return
    const name = title.toUpperCase().includes(u.model) ? title : `${title} (${u.model})`
    out.push({
      brand: 'samsung',
      category: u.category,
      name,
      model: u.model,
      pricePkr: pdp.pricePkr,
      imageUrl: pdp.image?.startsWith('http') ? pdp.image : pdp.image ? `https:${pdp.image}` : undefined,
      officialUrl: u.url,
      specs: specsFrom(`${title} ${pdp.description ?? ''}`, u.category),
      popularity: 50,
    })
  })
  return out
}

// ---------- run ----------

export interface ApplianceCollectResult {
  items: ApplianceImportInput[]
  failed: { brand: string; error: string }[]
  dropped: string[]
}

export async function collectAppliances(ctx: AdapterCtx, only?: string[]): Promise<ApplianceCollectResult> {
  const items: ApplianceImportInput[] = []
  const failed: ApplianceCollectResult['failed'] = []
  const dropped: string[] = []
  const seen = new Set<string>()
  const sources: [string, () => Promise<ApplianceImportInput[]>][] = [
    ...SHOPIFY_STORES.map((s) => [s.brand, () => fetchShopify(ctx, s)] as [string, () => Promise<ApplianceImportInput[]>]),
    ['samsung', () => fetchSamsungAppliances(ctx)],
    ...WOO_STORES.map((s) => [s.brand, () => fetchWoo(ctx, s)] as [string, () => Promise<ApplianceImportInput[]>]),
    ['toyota', () => fetchToyota(ctx)],
    ['hyundai', () => fetchHyundai(ctx)],
    ['pbs', () => fetchPbsSpi(ctx)],
  ]
  for (const [brand, run] of sources) {
    if (only?.length && !only.includes(brand)) continue
    try {
      for (const it of await run()) {
        const parsed = ApplianceImportItemSchema.safeParse(it)
        if (!parsed.success) {
          dropped.push(`${it.brand}/${it.name}`)
          continue
        }
        const slug = parsed.data.slug ?? applianceSlug(parsed.data.brand, parsed.data.name)
        if (seen.has(slug)) continue
        seen.add(slug)
        items.push({ ...parsed.data, slug })
      }
    } catch (e) {
      failed.push({ brand, error: e instanceof Error ? e.message : String(e) })
      ctx.log({ brand, err: String(e) }, 'appliance source failed')
    }
  }
  return { items, failed, dropped }
}

/** Daily job: read the brand stores, send everything to the web app in batches. Nothing is deleted; a failing store is retried tomorrow. */
export async function runAppliancePrices(request: Request, only?: string[]) {
  const ctx = makeCtx({ log: (obj, msg) => logger.warn(obj, msg), concurrency: 2 })
  const { items, failed, dropped } = await collectAppliances(ctx, only)
  if (dropped.length) logger.warn({ dropped: dropped.slice(0, 20), count: dropped.length }, 'appliances: invalid entries dropped')
  let created = 0
  let updated = 0
  const changes: unknown[] = []
  for (let i = 0; i < items.length; i += 50) {
    const res = await request<{ created: number; updated: number; changes: unknown[] }>('POST', '/api/pipeline/appliances/import', { appliances: items.slice(i, i + 50) }, { timeoutMs: 180_000 })
    created += res.created
    updated += res.updated
    changes.push(...res.changes)
  }
  logger.info({ items: items.length, created, updated, changes: changes.length, failed }, 'appliance prices refreshed')
  // Then re-rank: hotScore from 7-day visitors and the searches each item answers ("Trending prices", compare pages)
  let hot: unknown = null
  try {
    hot = await request<{ changed: number; uncovered: unknown[] }>('POST', '/api/pipeline/prices/hot', {}, { timeoutMs: 180_000 })
  } catch (e) {
    logger.warn({ err: String(e) }, 'price hot scores failed')
  }
  let history: unknown = null
  try {
    history = await runPbsBackfill(request)
  } catch (e) {
    logger.warn({ err: String(e) }, 'PBS history backfill failed')
  }
  return { items: items.length, created, updated, changes: changes.length, failed, dropped: dropped.length, hot, history }
}

/**
 * PBS weekly history (12 Nov 2026): the releases pbs.gov.pk still has online, one point per item per week with the
 * release page as source. Idempotent: the server says which days atta already has, only missing releases are read,
 * and the import skips days and prices already recorded. A normal day finds nothing to do.
 */
export async function runPbsBackfill(request: Request, max = 20) {
  const ctx = makeCtx({ log: (obj, msg) => logger.warn(obj, msg), concurrency: 2 })
  const { days } = await request<{ days: string[] }>('GET', '/api/pipeline/appliances/history-days?slug=atta-20kg-price')
  const points = await fetchPbsHistory(ctx, days, max)
  let added = 0
  for (let i = 0; i < points.length; i += 500) {
    const res = await request<{ added: number }>('POST', '/api/pipeline/appliances/history', { points: points.slice(i, i + 500) }, { timeoutMs: 180_000 })
    added += res.added
  }
  logger.info({ points: points.length, added }, 'PBS price history backfill')
  return { points: points.length, added }
}
