import { NextResponse } from 'next/server'
import { closestCategories, searchPrices } from '@/lib/appliances/search'
import { getSearchIndex, logMissedSearch } from '@/lib/appliances/searchIndex'

/**
 * Price search for the box on /prices, the home page and the header. Not a page: /api/ is disallowed in robots.txt and
 * nothing here is linked, so it creates nothing crawlable.
 *   GET  /api/prices/search?q=anda  -> items, categories, rate pages; when nothing matches, the closest categories
 *   POST /api/prices/search {q}     -> a search with no result, logged to price-demand (origin site-search)
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 80)
  const index = await getSearchIndex()
  const r = searchPrices(index, q, 8)
  const empty = r.total === 0 && r.categories.length === 0 && r.pages.length === 0
  return NextResponse.json(
    {
      q,
      total: r.total,
      fuzzy: r.fuzzy,
      items: r.items.map((i) => ({ n: i.name, h: i.href, b: i.brand, c: i.category, p: i.price, u: i.unit ?? null, k: i.kind })),
      categories: r.categories.map((c) => ({ n: c.name, h: c.href, count: c.count, min: c.minPrice })),
      pages: r.pages,
      closest: empty && q.trim().length >= 2 ? closestCategories(index, q, 4).map((c) => ({ n: c.name, h: c.href, count: c.count, min: c.minPrice })) : [],
    },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  )
}

const hits = new Map<string, { n: number; reset: number }>()
let loggedToday = { day: '', n: 0 }

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim()
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 3_600_000 })
  else if (++h.n > 20) return NextResponse.json({ ok: false }, { status: 429 })
  if (hits.size > 5000) hits.clear()
  const day = new Date().toISOString().slice(0, 10)
  if (loggedToday.day !== day) loggedToday = { day, n: 0 }
  // a ceiling per process per day, so nobody can fill the demand list with junk
  if (++loggedToday.n > 300) return NextResponse.json({ ok: false }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as { q?: unknown }
  const q = typeof body.q === 'string' ? body.q : ''
  // only log what really finds nothing: ask the index again, do not trust the client
  const r = searchPrices(await getSearchIndex(), q, 1)
  if (r.total > 0 || r.categories.length > 0 || r.pages.length > 0) return NextResponse.json({ ok: true, logged: false })
  return NextResponse.json({ ok: true, logged: await logMissedSearch(q).catch(() => false) })
}
