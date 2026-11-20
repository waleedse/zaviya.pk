import { NextResponse } from 'next/server'
import { PRODUCTS_INDEX, type ProductDoc } from '@zaviya/shared'
import { meili, meiliConfigured } from '@/lib/search/meili'
import { searchOffers } from '@/lib/offers/search'

/**
 * Product search (docs/PRODUCT-SEARCH.md). GET /api/search?q=&group=&store=&sort=price|drop&min=&max=&stock=1&limit=
 * Server-side only: the Meilisearch key never reaches the browser. `Server-Timing` shows the time spent in Meilisearch.
 * If Meilisearch is down it falls back to the Postgres title search.
 */
export const dynamic = 'force-dynamic'

const SORTS: Record<string, string[]> = { price: ['min_price:asc'], drop: ['price_drop_pct:desc'], cheapest: ['min_price:asc'] }
const clean = (v: string | null, max = 60) => (v ?? '').replace(/["\\]/g, '').slice(0, max)

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const q = clean(sp.get('q'), 100).trim()
  const filter: string[] = []
  const group = clean(sp.get('group'))
  const store = clean(sp.get('store'))
  const brand = clean(sp.get('brand'))
  const cat = clean(sp.get('cat'), 120)
  if (cat) filter.push(`category_path = "${cat}"`)
  if (group) filter.push(`group = "${group}"`)
  if (store) filter.push(`stores = "${store}"`)
  if (brand) filter.push(`brand = "${brand}"`)
  const min = Number(sp.get('min'))
  const max = Number(sp.get('max'))
  if (Number.isFinite(min) && min > 0) filter.push(`min_price >= ${Math.floor(min)}`)
  if (Number.isFinite(max) && max > 0) filter.push(`min_price <= ${Math.floor(max)}`)
  if (sp.get('stock') === '1') filter.push('in_stock_any = true')
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 20, 1), 48)
  const offset = Math.min(Math.max(Number(sp.get('offset')) || 0, 0), 1000)
  const headers = { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=120' }
  const t0 = performance.now()
  if (meiliConfigured()) {
    try {
      const r = await meili<{ hits: ProductDoc[]; estimatedTotalHits: number; processingTimeMs: number; facetDistribution?: Record<string, Record<string, number>> }>(
        'POST',
        `/indexes/${PRODUCTS_INDEX}/search`,
        {
          q,
          limit,
          offset,
          filter: filter.length ? filter : undefined,
          sort: SORTS[sp.get('sort') ?? ''],
          facets: ['category_path', 'stores', 'brand'],
          attributesToRetrieve: ['id', 'title', 'brand', 'group', 'category_path', 'image', 'image_store', 'offers', 'min_price', 'max_price', 'store_count', 'in_stock_any', 'price_drop_pct', 'match_kind', 'match_slug'],
        },
        2500,
      )
      const total = performance.now() - t0
      return NextResponse.json(
        { q, total: r.estimatedTotalHits, hits: r.hits.map((h) => ({ ...h, offers: h.offers.slice(0, 6) })), facets: r.facetDistribution ?? {}, ms: r.processingTimeMs },
        { headers: { ...headers, 'server-timing': `meili;dur=${r.processingTimeMs}, total;dur=${total.toFixed(1)}` } },
      )
    } catch {
      // fall through to the Postgres search
    }
  }
  const rows = q ? await searchOffers(q, limit) : []
  return NextResponse.json({ q, total: rows.length, hits: [], fallback: rows, facets: {}, ms: 0 }, { headers })
}
