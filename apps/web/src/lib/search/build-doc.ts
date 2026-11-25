import { categoryLevels, docId, type ProductDoc } from '@zaviya/shared'

type Row = Record<string, any>

/** One Meilisearch document from every store row of one product (pure: no database, so it is unit-tested) */
export function buildDoc(key: string, rows: Row[], storeName: (slug: string) => string = (x) => x): ProductDoc | null {
  const nameOf = storeName
  const offers = rows
    .filter((r) => r.price_pkr != null)
    .map((r) => ({
      slug: String(r.slug),
      store: String(r.store),
      store_name: storeName(String(r.store)),
      price: Number(r.price_pkr),
      list_price: r.list_price_pkr != null && Number(r.list_price_pkr) > Number(r.price_pkr) ? Number(r.list_price_pkr) : null,
      in_stock: r.in_stock !== false,
      url: String(r.url),
      image: (r.image_url as string | null) ?? null,
      updated_at: Math.floor(new Date(r.seen_at ?? Date.now()).getTime() / 1000),
    }))
    .sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || a.price - b.price)
    .slice(0, 30)
  if (!offers.length) return null
  const best = rows.find((r) => Number(r.price_pkr) === offers[0]!.price && String(r.store) === offers[0]!.store) ?? rows[0]!
  const withImage = rows.find((r) => r.image_url)
  const images: { url: string; store: string }[] = []
  for (const r of rows) {
    for (const u of [r.image_url, ...(Array.isArray(r.images) ? r.images : [])]) {
      if (typeof u === 'string' && u && images.length < 6 && !images.some((i) => i.url === u)) images.push({ url: u, store: nameOf(String(r.store)) })
    }
  }
  const description = rows.map((r) => (typeof r.description === 'string' ? r.description : '')).sort((a, b) => b.length - a.length)[0] || null
  const specs: Record<string, string> = {}
  for (const r of rows) {
    const sp = r.specs && typeof r.specs === 'object' ? (r.specs as Record<string, string>) : {}
    for (const [k, v] of Object.entries(sp)) if (Object.keys(specs).length < 24 && !(k in specs) && typeof v === 'string') specs[k] = v
  }
  const prices = offers.map((o) => o.price)
  const weekAgo = Date.now() - 7 * 86_400_000
  let drop = 0
  for (const r of rows) {
    if (r.prev_price_pkr && r.price_changed_at && new Date(r.price_changed_at).getTime() > weekAgo && Number(r.price_pkr) < Number(r.prev_price_pkr)) {
      drop = Math.max(drop, Math.round((1 - Number(r.price_pkr) / Number(r.prev_price_pkr)) * 100))
    }
  }
  const stores = [...new Set(offers.map((o) => o.store))]
  return {
    id: docId(key),
    title: String(best.title),
    brand: (best.brand as string | null) ?? null,
    model: (best.model as string | null) ?? null,
    group: String(best.group),
    category_path: categoryLevels(((best.cat as string | null) ?? null) === 'Other' ? null : ((best.cat as string | null) ?? null)),
    image: (withImage?.image_url as string | null) ?? null,
    image_store: withImage ? String(withImage.store) : null,
    images,
    description,
    specs: Object.keys(specs).length ? specs : null,
    offers,
    min_price: Math.min(...prices),
    max_price: Math.max(...prices),
    store_count: stores.length,
    stores,
    in_stock_any: offers.some((o) => o.in_stock),
    match_kind: (best.match_kind as string | null) ?? null,
    match_slug: (best.match_slug as string | null) ?? null,
    price_drop_pct: drop,
    // main products rank above their accessories ("iphone" shows phones before chargers); more stores and a match to our own page rank higher
    popularity: stores.length * 10 + (offers.some((o) => o.in_stock) ? 5 : 0) + (best.match_slug ? 20 : 0) + (['mobiles', 'laptops', 'tablets', 'tvs', 'cameras', 'home-appliances', 'smartwatches'].includes(String(best.group)) ? 25 : 0) - (best.group === 'accessories' ? 10 : 0),
    updated_at: Math.max(...offers.map((o) => o.updated_at)),
  }
}
