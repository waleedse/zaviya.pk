import { PRODUCTS_INDEX, formatPkr, type ProductDoc, type ProductOffer } from '@zaviya/shared'
import { meili, meiliConfigured } from './meili'
import { discountPct, sortOffers } from './product-pure'

export { clip, compareHref, discountPct, productHref, sortOffers } from './product-pure'

/** Rule-based buying pick of a product page: the facts the AI note (when there is one) must agree with */
export interface BuyingPick {
  best: ProductOffer
  headline: string
  points: string[]
  /** a cheaper store that has no stock right now */
  cheaperOutOfStock: ProductOffer | null
  savingVsHighest: number
  discountPct: number | null
}

export function buyingPick(p: Pick<ProductDoc, 'offers'>): BuyingPick | null {
  if (!p.offers.length) return null
  const sorted = sortOffers(p.offers)
  const best = sorted[0]!
  const inStock = sorted.filter((o) => o.in_stock)
  const cheaperOutOfStock = !best.in_stock ? null : sorted.filter((o) => !o.in_stock && o.price < best.price).sort((a, b) => a.price - b.price)[0] ?? null
  const highest = Math.max(...inStock.map((o) => o.price), best.price)
  const saving = highest - best.price
  const dp = discountPct(best)
  const points: string[] = []
  if (!best.in_stock) points.push('No store has it in stock right now: check back, or ask the store about the next delivery.')
  else {
    if (inStock.length > 1) points.push(`${formatPkr(saving)} less than the dearest store that has it in stock (${inStock.at(-1)!.store_name}, ${formatPkr(highest)}).`)
    if (dp >= 5) points.push(`${dp}% under the store's own list price of ${formatPkr(best.list_price!)}.`)
    if (cheaperOutOfStock) points.push(`${cheaperOutOfStock.store_name} lists it for ${formatPkr(cheaperOutOfStock.price)} (${formatPkr(best.price - cheaperOutOfStock.price)} less) but is out of stock.`)
    const same = inStock.filter((o) => o !== best && o.price === best.price)
    if (same.length) points.push(`${same.map((o) => o.store_name).join(' and ')} ${same.length > 1 ? 'have' : 'has'} the same price.`)
  }
  return {
    best,
    headline: best.in_stock ? `Buy from ${best.store_name} at ${formatPkr(best.price)}` : `Cheapest listed price: ${formatPkr(best.price)} at ${best.store_name} (out of stock)`,
    points,
    cheaperOutOfStock,
    savingVsHighest: saving,
    discountPct: dp || null,
  }
}

/** Similar products: same category (deepest level with enough products), most popular first, never the product itself */
export async function similarProducts(p: ProductDoc, limit = 8): Promise<ProductDoc[]> {
  if (!meiliConfigured()) return []
  const levels = [...p.category_path].reverse().filter((c) => c !== 'Other')
  for (const cat of levels) {
    try {
      const r = await meili<{ hits: ProductDoc[] }>(
        'POST',
        `/indexes/${PRODUCTS_INDEX}/search`,
        { q: '', filter: [`category_path = "${cat.replace(/"/g, '')}"`, 'in_stock_any = true'], sort: ['popularity:desc'], limit: limit + 4, attributesToRetrieve: ['id', 'title', 'brand', 'image', 'min_price', 'max_price', 'store_count', 'in_stock_any', 'offers', 'category_path'] },
        4000,
      )
      const hits = r.hits.filter((h) => h.id !== p.id && h.in_stock_any).slice(0, limit)
      if (hits.length >= 3) return hits
    } catch {
      return []
    }
  }
  return []
}
