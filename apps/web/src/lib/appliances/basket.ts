import type { ApplianceView } from './logic'

/**
 * A family's monthly kitchen basket, priced in every city from the PBS weekly survey (average market price).
 * The quantities are Zaviya's own simple assumption for a family of five, shown on the page. Every item must be
 * surveyed in all 17 cities (IRRI rice is not sold in Lahore, Gujranwala or Sialkot, so the basket uses basmati).
 */
export const MONTHLY_BASKET: { slug: string; qty: number; label: string }[] = [
  { slug: 'atta-20kg-price', qty: 2, label: '2 bags atta (20 kg)' },
  { slug: 'sugar-price', qty: 5, label: '5 kg sugar' },
  { slug: 'ghee-1kg-price', qty: 4, label: '4 kg ghee' },
  { slug: 'fresh-milk-price', qty: 30, label: '30 litres milk' },
  { slug: 'eggs-price', qty: 4, label: '4 dozen eggs' },
  { slug: 'live-chicken-price', qty: 4, label: '4 kg chicken' },
  { slug: 'basmati-rice-price', qty: 5, label: '5 kg rice (basmati broken)' },
  { slug: 'daal-masoor-price', qty: 2, label: '2 kg daal masoor' },
  { slug: 'daal-chana-price', qty: 2, label: '2 kg daal chana' },
  { slug: 'potato-price', qty: 5, label: '5 kg potatoes' },
  { slug: 'onion-price', qty: 5, label: '5 kg onions' },
  { slug: 'tomato-price', qty: 4, label: '4 kg tomatoes' },
  { slug: 'tea-190g-price', qty: 3, label: '3 packs tea (190 g)' },
  { slug: 'lpg-cylinder-price', qty: 1, label: '1 LPG cylinder (11.67 kg)' },
]

export interface CityBasket {
  city: string
  total: number
  /** item slug -> line cost */
  lines: Record<string, number>
}

/** Basket total per city; a city missing any basket item is left out so totals stay comparable. Cheapest first. */
export function cityBaskets(items: ApplianceView[]): CityBasket[] {
  const bySlug = new Map(items.map((a) => [a.slug, a]))
  const basket = MONTHLY_BASKET.filter((b) => bySlug.get(b.slug)?.cityPrices.length)
  const cities = new Set(basket.flatMap((b) => bySlug.get(b.slug)!.cityPrices.map((c) => c.city)))
  const out: CityBasket[] = []
  for (const city of cities) {
    const lines: Record<string, number> = {}
    let ok = true
    for (const b of basket) {
      const p = bySlug.get(b.slug)!.cityPrices.find((c) => c.city === city)
      if (!p || !(p.avg > 0)) {
        ok = false
        break
      }
      lines[b.slug] = Math.round(p.avg * b.qty)
    }
    if (ok) out.push({ city, total: Object.values(lines).reduce((s, n) => s + n, 0), lines })
  }
  return out.sort((a, b) => a.total - b.total)
}

export interface ItemSpread {
  item: ApplianceView
  cheapest: { city: string; avg: number }
  costliest: { city: string; avg: number }
  /** costliest / cheapest - 1, as a percentage */
  gapPct: number
}

/** For each grocery item: the cheapest and costliest city, biggest gap first */
export function itemSpreads(items: ApplianceView[]): ItemSpread[] {
  return items
    .filter((a) => a.cityPrices.filter((c) => c.avg > 0).length >= 3)
    .map((item) => {
      const cs = item.cityPrices.filter((c) => c.avg > 0).sort((a, b) => a.avg - b.avg)
      const lo = cs[0]!
      const hi = cs[cs.length - 1]!
      return { item, cheapest: { city: lo.city, avg: lo.avg }, costliest: { city: hi.city, avg: hi.avg }, gapPct: Math.round((hi.avg / lo.avg - 1) * 100) }
    })
    .sort((a, b) => b.gapPct - a.gapPct)
}
