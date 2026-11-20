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

interface ShopifyProduct {
  title?: string
  handle?: string
  vendor?: string
  product_type?: string
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
    })
  }
  return out
}
