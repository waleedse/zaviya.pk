import { PRODUCTS_INDEX, type ProductDoc } from '@zaviya/shared'
import { discountPct } from './product-pure'
import { meili, meiliConfigured } from './meili'

/** Data of the prices hub: best offers per price band, and popular products (docs/PRODUCT-SEARCH.md, 26 Nov redesign) */
export interface DealCard {
  id: string
  title: string
  image: string | null
  price: number
  listPrice: number | null
  offPct: number
  store: string
  stores: number
}

export const PRICE_BANDS = [
  { key: 'under-5k', label: 'Under Rs 5,000', min: 100, max: 4999 },
  { key: '5k-25k', label: 'Rs 5,000 – 25,000', min: 5000, max: 24999 },
  { key: '25k-1l', label: 'Rs 25,000 – 1 lakh', min: 25000, max: 99999 },
  { key: 'over-1l', label: 'Over 1 lakh', min: 100000, max: 5_000_000 },
] as const

const FIELDS = ['id', 'title', 'image', 'offers', 'min_price', 'store_count', 'in_stock_any', 'price_drop_pct']

/** The in-stock offer with the biggest real cut against the store's own crossed-out price */
function card(p: ProductDoc): DealCard | null {
  const live = p.offers.filter((o) => o.in_stock)
  if (!live.length) return null
  const best = [...live].sort((a, b) => discountPct(b) - discountPct(a) || a.price - b.price)[0]!
  return { id: p.id, title: p.title, image: p.image, price: best.price, listPrice: best.list_price, offPct: discountPct(best), store: best.store_name, stores: p.store_count }
}

/** Best real discounts in a price band. Popular products first, then the ones with the deepest cut; real discounts only (5%+). */
export async function bestOffers(min: number, max: number, limit = 8): Promise<DealCard[]> {
  if (!meiliConfigured()) return []
  try {
    const r = await meili<{ hits: ProductDoc[] }>('POST', `/indexes/${PRODUCTS_INDEX}/search`, { q: '', filter: [`min_price >= ${min}`, `min_price <= ${max}`, 'in_stock_any = true', 'store_count >= 2'], sort: ['popularity:desc'], limit: 300, attributesToRetrieve: FIELDS }, 8000)
    return r.hits
      .map(card)
      .filter((c): c is DealCard => c != null && c.offPct >= 5 && c.offPct <= 70)
      .sort((a, b) => b.offPct - a.offPct)
      .slice(0, limit)
  } catch {
    return []
  }
}

/** Biggest cuts across the whole catalogue (the "On sale" page) */
export async function onSale(limit = 48, cat?: string): Promise<DealCard[]> {
  if (!meiliConfigured()) return []
  try {
    const filter = ['in_stock_any = true', 'store_count >= 2', ...(cat ? [`category_path = "${cat.replace(/"/g, '')}"`] : [])]
    const r = await meili<{ hits: ProductDoc[] }>('POST', `/indexes/${PRODUCTS_INDEX}/search`, { q: '', filter, sort: ['popularity:desc'], limit: 400, attributesToRetrieve: FIELDS }, 8000)
    return r.hits
      .map(card)
      .filter((c): c is DealCard => c != null && c.offPct >= 10 && c.offPct <= 70)
      .sort((a, b) => b.offPct - a.offPct)
      .slice(0, limit)
  } catch {
    return []
  }
}

export interface PopularItem { id: string; title: string; image: string | null; price: number; stores: number; offPct: number }

/** Most popular products sold by 2+ stores, in stock */
export async function popularItems(limit = 9, cat?: string): Promise<PopularItem[]> {
  if (!meiliConfigured()) return []
  try {
    const filter = ['in_stock_any = true', 'store_count >= 2', ...(cat ? [`category_path = "${cat.replace(/"/g, '')}"`] : [])]
    const r = await meili<{ hits: ProductDoc[] }>('POST', `/indexes/${PRODUCTS_INDEX}/search`, { q: '', filter, sort: ['popularity:desc'], limit, attributesToRetrieve: FIELDS }, 6000)
    return r.hits.map((p) => ({ id: p.id, title: p.title, image: p.image, price: Math.min(...p.offers.filter((o) => o.in_stock).map((o) => o.price), p.min_price), stores: p.store_count, offPct: Math.max(0, ...p.offers.map(discountPct)) }))
  } catch {
    return []
  }
}
