import { sql } from '@payloadcms/db-postgres'
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
  brand: string | null
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
    // marketplace stores put the seller in "vendor": it is the brand only when the title names it
    brand: d.brand && String(d.title).toLowerCase().includes(String(d.brand).toLowerCase()) ? String(d.brand) : null,
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

// ---------- shop pages: /prices/shop/<group> and /prices/item/<slug> (15 Nov 2026) ----------

type Row = Record<string, any>
async function rows(q: ReturnType<typeof sql>): Promise<Row[]> {
  const payload = await getPayloadClient()
  return ((await payload.db.drizzle.execute(q)) as unknown as { rows?: Row[] }).rows ?? []
}

const fromRow = (r: Row): OfferView =>
  toOfferView({
    slug: r.slug,
    store: r.store,
    title: r.title,
    url: r.url,
    imageUrl: r.image_url,
    pricePkr: r.price_pkr,
    listPricePkr: r.list_price_pkr,
    prevPricePkr: r.prev_price_pkr,
    priceChangedAt: r.price_changed_at ? new Date(r.price_changed_at).toISOString() : null,
    inStock: r.in_stock,
    group: r.group,
    matchKind: r.match_kind,
    matchSlug: r.match_slug,
    seenAt: r.seen_at ? new Date(r.seen_at).toISOString() : null,
    brand: r.brand,
  })

const COLS = sql`slug, store, title, brand, "group", url, image_url, price_pkr, list_price_pkr, prev_price_pkr, price_changed_at, in_stock, match_kind, match_slug, seen_at`
const FRESH = sql`seen_at > now() - interval '3 days' AND price_pkr IS NOT NULL`

export interface GroupSummary {
  slug: string
  count: number
  minPrice: number | null
  imageUrl: string | null
}

/** Listings per store category with the cheapest price and one picture (the most expensive in-stock item looks best) */
export async function offerGroupSummaries(): Promise<GroupSummary[]> {
  try {
    const r = await rows(sql`
      SELECT "group" AS slug, count(*)::int AS count,
        -- "from" price: the 5th percentile, so a Rs 199 sleeve does not make laptops look "from Rs 199"
        percentile_disc(0.05) WITHIN GROUP (ORDER BY price_pkr) AS min_price,
        (array_agg(image_url ORDER BY coalesce(in_stock, true) DESC, price_pkr DESC) FILTER (WHERE image_url IS NOT NULL))[1] AS image_url
      FROM store_offers WHERE ${FRESH} GROUP BY "group"`)
    return r.map((x) => ({ slug: String(x.slug), count: Number(x.count), minPrice: x.min_price == null ? null : Number(x.min_price), imageUrl: x.image_url ?? null }))
  } catch {
    return []
  }
}

export type OfferSort = 'popular' | 'low' | 'high' | 'drops'
export const OFFER_PAGE_SIZE = 48

/** One page of a store category, with its brands for the filter chips */
export async function offersInGroup(group: string, opts: { brand?: string; sort?: OfferSort; page?: number } = {}): Promise<{ items: OfferView[]; total: number; brands: { name: string; count: number }[] }> {
  try {
    const brandWhere = opts.brand ? sql` AND lower(brand) = ${opts.brand.toLowerCase()} AND position(lower(brand) in lower(title)) > 0` : sql``
    const order =
      opts.sort === 'low'
        ? sql`price_pkr ASC`
        : opts.sort === 'high'
          ? sql`price_pkr DESC`
          : opts.sort === 'drops'
            ? sql`(prev_price_pkr IS NOT NULL AND price_pkr < prev_price_pkr) DESC, price_changed_at DESC NULLS LAST`
            : // "popular": in stock, with a picture and a discount first, then the dearer (main) products before cheap add-ons
              sql`coalesce(in_stock, true) DESC, (image_url IS NOT NULL) DESC, (list_price_pkr > price_pkr) DESC, price_pkr DESC`
    const page = Math.max(1, opts.page ?? 1)
    const [items, total, brands] = await Promise.all([
      rows(sql`SELECT ${COLS} FROM store_offers WHERE ${FRESH} AND "group" = ${group}${brandWhere} ORDER BY ${order} LIMIT ${OFFER_PAGE_SIZE} OFFSET ${(page - 1) * OFFER_PAGE_SIZE}`),
      rows(sql`SELECT count(*)::int AS n FROM store_offers WHERE ${FRESH} AND "group" = ${group}${brandWhere}`),
      rows(sql`SELECT brand AS name, count(*)::int AS count FROM store_offers WHERE ${FRESH} AND "group" = ${group} AND brand IS NOT NULL AND brand <> '' AND position(lower(brand) in lower(title)) > 0 GROUP BY brand HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 24`),
    ])
    return { items: items.map(fromRow), total: Number(total[0]?.n ?? 0), brands: brands.map((b) => ({ name: String(b.name), count: Number(b.count) })) }
  } catch {
    return { items: [], total: 0, brands: [] }
  }
}

/** One listing, for its own page */
export async function getOffer(slug: string): Promise<OfferView | null> {
  try {
    const r = await rows(sql`SELECT ${COLS} FROM store_offers WHERE slug = ${slug} LIMIT 1`)
    return r[0] ? fromRow(r[0]) : null
  } catch {
    return null
  }
}

/** Words that make two listings the same product: the title without colours, pack words and punctuation */
export function productKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(black|white|blue|green|red|grey|gray|silver|gold|pink|purple|official|warranty|original|new|with|free|pta|approved)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The same product in other stores (same title words), cheapest first */
export async function sameProductOffers(o: OfferView): Promise<OfferView[]> {
  const key = productKey(o.title)
  const words = key.split(' ').filter((w) => w.length >= 2).slice(0, 4)
  if (!words.length) return [o]
  try {
    const where = sql.join(words.map((w) => sql`title ILIKE ${`%${w}%`}`), sql` AND `)
    const r = await rows(sql`SELECT ${COLS} FROM store_offers WHERE ${FRESH} AND ${where} LIMIT 60`)
    const same = r.map(fromRow).filter((x) => x.slug === o.slug || productKey(x.title) === key)
    return sortOffers(same.some((x) => x.slug === o.slug) ? same : [o, ...same])
  } catch {
    return [o]
  }
}

/** Other listings in the same category near this price (people compare a few before buying) */
export async function similarOffers(o: OfferView, limit = 8): Promise<OfferView[]> {
  if (!o.pricePkr) return []
  try {
    const r = await rows(sql`
      SELECT ${COLS} FROM store_offers
      WHERE ${FRESH} AND "group" = ${o.group} AND slug <> ${o.slug} AND image_url IS NOT NULL
        AND price_pkr BETWEEN ${Math.round(o.pricePkr * 0.6)} AND ${Math.round(o.pricePkr * 1.6)}
      ORDER BY abs(price_pkr - ${o.pricePkr}) LIMIT ${limit}`)
    return r.map(fromRow)
  } catch {
    return []
  }
}

/** Slugs for the sitemap: every fresh, priced listing with a picture */
export async function offerSitemapRows(limit = 20000): Promise<{ slug: string; group: string; updatedAt: string }[]> {
  try {
    const r = await rows(sql`SELECT slug, "group", updated_at FROM store_offers WHERE ${FRESH} AND image_url IS NOT NULL ORDER BY updated_at DESC LIMIT ${limit}`)
    return r.map((x) => ({ slug: String(x.slug), group: String(x.group), updatedAt: new Date(x.updated_at).toISOString() }))
  } catch {
    return []
  }
}

/** Biggest real discounts on store websites right now (crossed-out price), a few per category so one shop can't fill the row */
export async function topDiscounts(limit = 12): Promise<OfferView[]> {
  try {
    const r = await rows(sql`
      SELECT * FROM (
        SELECT ${COLS}, row_number() OVER (PARTITION BY "group" ORDER BY (list_price_pkr - price_pkr)::float / list_price_pkr DESC) AS rn
        FROM store_offers
        WHERE ${FRESH} AND coalesce(in_stock, true) AND image_url IS NOT NULL AND price_pkr >= 2000
          AND list_price_pkr > price_pkr AND (list_price_pkr - price_pkr)::float / list_price_pkr BETWEEN 0.1 AND 0.7
      ) t WHERE rn <= 3
      ORDER BY (list_price_pkr - price_pkr)::float / list_price_pkr DESC LIMIT ${limit}`)
    return r.map(fromRow)
  } catch {
    return []
  }
}
