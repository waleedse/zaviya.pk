import { RETAIL_STORES } from '@zaviya/shared'
import { getPayloadClient } from '../payload'

/** Store offers (15 Nov 2026): what Pakistani retail stores list in their own public feeds. */
export interface OfferView {
  slug: string
  store: string
  storeName: string
  title: string
  url: string
  imageUrl: string | null
  pricePkr: number | null
  listPricePkr: number | null
  prevPricePkr: number | null
  priceChangedAt: string | null
  inStock: boolean | null
  group: string
  matchKind: string | null
  matchSlug: string | null
  seenAt: string | null
}

/** A listing the feed has not shown for 3 days is gone from the store */
const FRESH_MS = 3 * 86_400_000

const storeName = (slug: string) => RETAIL_STORES.find((s) => s.slug === slug)?.name ?? slug

export function toOfferView(d: Record<string, any>): OfferView {
  const n = (v: unknown) => (v == null ? null : Number(v))
  return {
    slug: String(d.slug),
    store: String(d.store),
    storeName: storeName(String(d.store)),
    title: String(d.title),
    url: String(d.url),
    imageUrl: d.imageUrl ?? null,
    pricePkr: n(d.pricePkr),
    listPricePkr: n(d.listPricePkr),
    prevPricePkr: n(d.prevPricePkr),
    priceChangedAt: d.priceChangedAt ?? null,
    inStock: d.inStock ?? null,
    group: String(d.group),
    matchKind: d.matchKind ?? null,
    matchSlug: d.matchSlug ?? null,
    seenAt: d.seenAt ?? null,
  }
}

/** Offers for one of our phone or appliance pages, cheapest in-stock first */
export async function offersFor(kind: 'phone' | 'appliance', slug: string): Promise<OfferView[]> {
  try {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'store-offers' as never,
      where: { and: [{ matchKind: { equals: kind } }, { matchSlug: { equals: slug } }, { seenAt: { greater_than: new Date(Date.now() - FRESH_MS).toISOString() } }] } as never,
      limit: 30,
      depth: 0,
      overrideAccess: true,
    })
    return sortOffers((res.docs as unknown as Record<string, any>[]).map(toOfferView))
  } catch {
    // the table is new; a page must never fail because of it
    return []
  }
}

export function sortOffers(offers: OfferView[]): OfferView[] {
  return [...offers].sort((a, b) => Number(b.inStock !== false) - Number(a.inStock !== false) || (a.pricePkr ?? Infinity) - (b.pricePkr ?? Infinity))
}

/** Store prices that moved recently, biggest moves first: the "price changes" list people click */
export async function recentOfferChanges(limit = 12, days = 7): Promise<OfferView[]> {
  try {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'store-offers' as never,
      where: { and: [{ prevPricePkr: { exists: true } }, { priceChangedAt: { greater_than: new Date(Date.now() - days * 86_400_000).toISOString() } }, { imageUrl: { exists: true } }] } as never,
      limit: 200,
      depth: 0,
      sort: '-priceChangedAt',
      overrideAccess: true,
    })
    const rows = (res.docs as unknown as Record<string, any>[]).map(toOfferView).filter((o) => o.pricePkr && o.prevPricePkr && o.pricePkr !== o.prevPricePkr)
    rows.sort((a, b) => Math.abs(b.pricePkr! - b.prevPricePkr!) / b.prevPricePkr! - Math.abs(a.pricePkr! - a.prevPricePkr!) / a.prevPricePkr!)
    return rows.slice(0, limit)
  } catch {
    return []
  }
}
