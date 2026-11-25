import { categoryUrlPath } from '@zaviya/shared'
import { childrenOf, getCategoryTree, type CategoryRow } from './categories'
import { PRICE_BANDS, bestOffers, onSale, type DealCard } from './hub'
import type { BarCategory } from '@/components/prices/HubParts'

export const catHref = (path: string) => `/prices/c/${categoryUrlPath(path)}`

/** Top categories (everything but "Other"), the largest 11, with their sub-categories, the level below those, and each one's best offer */
export async function barCategories(tree?: CategoryRow[]): Promise<BarCategory[]> {
  const t = tree ?? (await getCategoryTree())
  const tops = childrenOf(t, null).filter((c) => c.path !== 'Other').slice(0, 11)
  const deals = await Promise.all(tops.map((c) => onSale(1, c.path)))
  return tops.map((c, i) => ({
    name: c.name,
    href: catHref(c.path),
    count: c.products,
    image: c.imageUrl,
    subs: childrenOf(t, c.path).slice(0, 9).map((s) => ({ name: s.name, href: catHref(s.path), count: s.products, leaves: childrenOf(t, s.path).slice(0, 4).map((l) => ({ name: l.name, href: catHref(l.path) })) })),
    deal: deals[i]![0] ? { id: deals[i]![0]!.id, title: deals[i]![0]!.title, price: deals[i]![0]!.price, was: deals[i]![0]!.listPrice } : null,
  }))
}

export async function bandDeals(): Promise<{ key: string; label: string; deals: DealCard[] }[]> {
  return Promise.all(PRICE_BANDS.map(async (b) => ({ key: b.key, label: b.label, deals: await bestOffers(b.min, b.max, 8) })))
}
