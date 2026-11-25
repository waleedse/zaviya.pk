import { type ProductOffer } from '@zaviya/shared'

/** Pure helpers shared by the server pages and the client components (no Meilisearch import here) */
export const discountPct = (o: ProductOffer) => (o.list_price && o.list_price > o.price ? Math.round((1 - o.price / o.list_price) * 100) : 0)

/** Offers cheapest first, in-stock ones before out-of-stock ones */
export const sortOffers = (offers: ProductOffer[], by: 'price' | 'discount' = 'price') =>
  [...offers].sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || (by === 'discount' ? discountPct(b) - discountPct(a) || a.price - b.price : a.price - b.price))

/** Compare page URL of two products: ids in a fixed order, so A vs B and B vs A are one page */
export const compareHref = (a: string, b: string) => {
  const [x, y] = a < b ? [a, b] : [b, a]
  return `/compare-products/${x}/${y}`
}

export const productHref = (id: string) => `/product/${id}`

/** Short plain-text description for a meta tag */
export const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n - 1)
  return `${/\s/.test(t[n - 1]!) ? cut : cut.replace(/\s+\S*$/, '')}…`
}
