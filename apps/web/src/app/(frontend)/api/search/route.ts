import { NextResponse } from 'next/server'
import { PRODUCTS_INDEX, type ProductDoc } from '@zaviya/shared'
import { meili, meiliConfigured } from '@/lib/search/meili'
import { searchOffers } from '@/lib/offers/search'
import { droppedWords, matchingStrategyFor, tokenize, type SearchNote } from '@/lib/search/relevance'

/**
 * Product search (docs/PRODUCT-SEARCH.md). GET /api/search?q=&group=&store=&sort=price|drop&min=&max=&stock=1&limit=
 * Server-side only: the Meilisearch key never reaches the browser. `Server-Timing` shows the time spent in Meilisearch.
 * If Meilisearch is down it falls back to the Postgres title search.
 */
export const dynamic = 'force-dynamic'

const SORTS: Record<string, string[]> = { price: ['min_price:asc'], drop: ['price_drop_pct:desc'], cheapest: ['min_price:asc'] }
/** Small in-process cache: the same query within 20 s is answered without touching Meilisearch */
const CACHE = new Map<string, { at: number; body: unknown }>()
const CACHE_MS = 20_000

/** Query spellings to try when the typed one finds little: words glued together (logi tech -> logitech), hyphens as spaces */
function queryVariants(q: string): string[] {
  const words = q.toLowerCase().split(/[\s\-_]+/).filter(Boolean)
  const out: string[] = []
  if (words.length >= 2) {
    for (let i = 0; i < words.length - 1; i++) out.push([...words.slice(0, i), words[i]! + words[i + 1]!, ...words.slice(i + 2)].join(' '))
    out.push(words.join(''))
  }
  return [...new Set(out)].filter((v) => v !== q.toLowerCase()).slice(0, 4)
}

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
    const cacheKey = request.url.split('?')[1] ?? ''
    const cached = CACHE.get(cacheKey)
    if (cached && Date.now() - cached.at < CACHE_MS) return NextResponse.json(cached.body, { headers: { ...headers, 'server-timing': 'cache;dur=0' } })
    try {
      type R = { hits: (ProductDoc & { _rankingScoreDetails?: { words?: { matchingWords: number; maxMatchingWords: number } } })[]; estimatedTotalHits: number; processingTimeMs: number; facetDistribution?: Record<string, Record<string, number>> }
      // part/accessory queries ('macbook speakers') must match every word; the rest may drop trailing words, and we say so
      const strategy = matchingStrategyFor(q)
      const run = (query: string) =>
        meili<R>(
          'POST',
          `/indexes/${PRODUCTS_INDEX}/search`,
          {
            q: query,
            limit,
            offset,
            filter: filter.length ? filter : undefined,
            sort: SORTS[sp.get('sort') ?? ''],
            facets: ['category_path', 'stores', 'brand'],
            matchingStrategy: strategy,
            showRankingScoreDetails: strategy === 'last',
            attributesToRetrieve: ['id', 'title', 'brand', 'group', 'category_path', 'image', 'image_store', 'offers', 'min_price', 'max_price', 'store_count', 'in_stock_any', 'price_drop_pct', 'match_kind', 'match_slug'],
          },
          2500,
        )
      let r = await run(q)
      let used = q
      if (q && r.estimatedTotalHits < 5 && offset === 0) {
        // Few hits: try the words glued together or split differently and keep the spelling that finds the most
        for (const v of queryVariants(q)) {
          const alt = await run(v)
          if (alt.estimatedTotalHits > r.estimatedTotalHits) {
            r = alt
            used = v
          }
        }
      }
      const total = performance.now() - t0
      // never show unrelated products silently: say what matched, or that nothing did
      const note: SearchNote | null = !q ? null : strategy === 'all' ? (r.hits.length ? null : { kind: 'none', words: tokenize(q) }) : droppedWords(used, r.hits[0])
      const body = { q, used: used === q ? undefined : used, note, total: r.estimatedTotalHits, hits: r.hits.map(({ _rankingScoreDetails: _d, ...h }) => ({ ...h, offers: h.offers.slice(0, 6) })), facets: r.facetDistribution ?? {}, ms: r.processingTimeMs }
      if (CACHE.size > 500) CACHE.clear()
      CACHE.set(cacheKey, { at: Date.now(), body })
      return NextResponse.json(body, { headers: { ...headers, 'server-timing': `meili;dur=${r.processingTimeMs}, total;dur=${total.toFixed(1)}` } })
    } catch {
      // fall through to the Postgres search
    }
  }
  const rows = q ? await searchOffers(q, limit) : []
  return NextResponse.json({ q, total: rows.length, hits: [], fallback: rows, facets: {}, ms: 0 }, { headers })
}
