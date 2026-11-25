import { decodeEntities } from '../phones/highlights.js'
import { modelFrom } from '../appliances/collect.js'

/** One listing in the shape POST /api/pipeline/search/import takes */
export interface Listing {
  handle: string
  title: string
  brand?: string
  productType?: string
  url: string
  imageUrl?: string
  pricePkr: number
  listPricePkr?: number | null
  inStock?: boolean
  model?: string
  gtin?: string
  /** up to 6 pictures from the store's listing (the first is imageUrl) */
  images?: string[]
  /** the store's own product text, tags removed, at most 1,200 characters */
  description?: string
  /** name -> value pairs the store lists (options, attributes, schema.org additionalProperty), at most 30 */
  specs?: Record<string, string>
}

const pkr = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 10 && n <= 50_000_000 ? Math.round(n) : null
}
const clean = (s: unknown, max: number) => decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim().slice(0, max)
const img = (src: unknown) => {
  const s = String(src ?? '')
  return s.startsWith('//') ? `https:${s}` : s.startsWith('http') ? s : undefined
}
/** HTML -> plain text for the product description: tags out, block ends as line breaks, entities decoded */
export const htmlText = (html: unknown, max = 1200) =>
  decodeEntities(String(html ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|li|div|h\d|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\u00a0]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim().slice(0, max)
/** Distinct picture URLs, at most 6 */
export const imageList = (srcs: unknown[]): string[] | undefined => {
  const out = [...new Set(srcs.map(img).filter((x): x is string => Boolean(x) && x!.length <= 500))].slice(0, 6)
  return out.length ? out : undefined
}
/** name/value pairs, cleaned, at most 30; empty -> undefined */
export function specList(pairs: [unknown, unknown][]): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [k, v] of pairs) {
    const key = clean(k, 60)
    const val = clean(v, 200)
    if (!key || !val || /^(title|default title)$/i.test(key) || /^default title$/i.test(val)) continue
    if (Object.keys(out).length >= 30) break
    out[key] = val
  }
  return Object.keys(out).length ? out : undefined
}

interface ShopifyProduct {
  title?: string
  handle?: string
  vendor?: string
  product_type?: string
  body_html?: string
  options?: { name?: string; values?: string[] }[]
  images?: { src?: string }[]
  variants?: { price?: string; compare_at_price?: string | null; available?: boolean; barcode?: string | null }[]
}

export function parseShopify(products: ShopifyProduct[], base: string, storeName: string): Listing[] {
  const out: Listing[] = []
  for (const p of products) {
    const title = clean(p.title, 200)
    if (!title || title.length < 2 || !p.handle) continue
    const variants = p.variants ?? []
    const prices = variants.map((v) => pkr(v.price)).filter((n): n is number => n != null)
    if (!prices.length) continue
    const price = Math.min(...prices)
    const cheapest = variants.find((v) => pkr(v.price) === price)
    const list = pkr(cheapest?.compare_at_price)
    const vendor = clean(p.vendor, 60)
    const barcode = cheapest?.barcode ?? variants.find((v) => v.barcode)?.barcode ?? undefined
    out.push({
      handle: p.handle.slice(0, 200),
      title,
      brand: vendor && !new RegExp(`^${storeName.split(' ')[0]!.replace(/[^a-z0-9]/gi, '')}\\b`, 'i').test(vendor) ? vendor : undefined,
      productType: clean(p.product_type, 120) || undefined,
      url: `${base}/products/${p.handle}`,
      imageUrl: img(p.images?.[0]?.src),
      pricePkr: price,
      listPricePkr: list && list > price ? list : null,
      inStock: variants.some((v) => v.available !== false),
      model: modelFrom(title),
      gtin: barcode && /^\d{8,14}$/.test(barcode) ? barcode : undefined,
      images: imageList((p.images ?? []).map((i) => i.src)),
      description: htmlText(p.body_html) || undefined,
      specs: specList([...(vendor ? [['Brand', vendor] as [string, string]] : []), ...(p.options ?? []).filter((o) => o.values?.length && !(o.values.length === 1 && /default/i.test(o.values[0] ?? ''))).map((o) => [o.name, o.values!.join(', ')] as [unknown, unknown])]),
    })
  }
  return out
}

interface WooProduct {
  id?: number
  name?: string
  slug?: string
  permalink?: string
  prices?: { price?: string; regular_price?: string; currency_code?: string; currency_minor_unit?: number }
  images?: { src?: string }[]
  categories?: { name?: string }[]
  brands?: { name?: string }[]
  description?: string
  short_description?: string
  attributes?: { name?: string; terms?: { name?: string }[] }[]
  is_in_stock?: boolean
}

export function parseWoo(products: WooProduct[]): Listing[] {
  const out: Listing[] = []
  for (const p of products) {
    const title = clean(p.name, 200)
    if (!title || !p.permalink || !p.prices) continue
    if (p.prices.currency_code && p.prices.currency_code !== 'PKR') continue
    const div = 10 ** (p.prices.currency_minor_unit ?? 0)
    const price = pkr(Number(p.prices.price) / div)
    if (price == null) continue
    const reg = pkr(Number(p.prices.regular_price) / div)
    out.push({
      handle: String(p.slug || p.id).slice(0, 200),
      title,
      brand: clean(p.brands?.[0]?.name, 60) || undefined,
      productType: clean(p.categories?.map((c) => c.name).filter(Boolean).slice(0, 2).join(' > '), 120) || undefined,
      url: p.permalink,
      imageUrl: img(p.images?.[0]?.src),
      pricePkr: price,
      listPricePkr: reg && reg > price ? reg : null,
      inStock: p.is_in_stock !== false,
      model: modelFrom(title),
      images: imageList((p.images ?? []).map((i) => i.src)),
      description: htmlText(p.description || p.short_description) || undefined,
      specs: specList((p.attributes ?? []).map((a) => [a.name, (a.terms ?? []).map((t) => t.name).filter(Boolean).join(', ')])),
    })
  }
  return out
}
