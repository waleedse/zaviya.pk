import { PRODUCTS_INDEX } from '@zaviya/shared'
import { meili, meiliConfigured } from '@/lib/search/meili'
import { getCategoryTree } from '@/lib/search/categories'
import { catHref } from '@/lib/search/hub-data'
import { compareHref } from '@/lib/search/product-pure'

/**
 * /product-sitemap.xml: every product page Google may index (sold by 2+ stores, same rule as the noindex
 * in /product/[id]). Without it the 70k+ product pages were undiscoverable. One file holds at most 50,000 URLs.
 */
export const dynamic = 'force-dynamic'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const MAX_URLS = 40_000
const MAX_COMPARE = 3_000
const PAGE = 1000

type Doc = { id: string; updated_at?: number | string }

export async function GET() {
  const urls: string[] = []
  if (meiliConfigured()) {
    try {
      for (let offset = 0; offset < MAX_URLS; offset += PAGE) {
        const res = await meili<{ results: Doc[] }>(
          'POST',
          `/indexes/${PRODUCTS_INDEX}/documents/fetch`,
          { filter: 'store_count >= 2', fields: ['id', 'updated_at'], limit: PAGE, offset },
          10_000,
        )
        for (const d of res.results) {
          if (!/^[A-Za-z0-9_-]{1,480}$/.test(d.id)) continue
          const t = typeof d.updated_at === 'number' ? new Date(d.updated_at * (d.updated_at < 1e12 ? 1000 : 1)) : d.updated_at ? new Date(d.updated_at) : null
          const lastmod = t && !Number.isNaN(t.getTime()) ? `<lastmod>${t.toISOString()}</lastmod>` : ''
          urls.push(`<url><loc>${siteUrl}/product/${d.id}</loc>${lastmod}<changefreq>daily</changefreq><priority>0.5</priority></url>`)
        }
        if (res.results.length < PAGE) break
      }
    } catch {
      // Meilisearch down: serve what we have (possibly empty) instead of failing the crawl
    }
  }
  // category pages (every level with 3+ products) and compare pages (popular products against their neighbours in the same category)
  try {
    const tree = await getCategoryTree()
    for (const c of tree) if (c.products >= 3 && c.path !== 'Other') urls.push(`<url><loc>${siteUrl}${catHref(c.path)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`)
    const pop = await meili<{ hits: { id: string; category_path: string[] }[] }>(
      'POST',
      `/indexes/${PRODUCTS_INDEX}/search`,
      { q: '', filter: ['store_count >= 2', 'in_stock_any = true'], sort: ['popularity:desc'], limit: 1000, attributesToRetrieve: ['id', 'category_path'] },
      10_000,
    )
    const byCat = new Map<string, string[]>()
    for (const h of pop.hits) {
      const leaf = h.category_path.at(-1)
      if (leaf && leaf !== 'Other') byCat.set(leaf, [...(byCat.get(leaf) ?? []), h.id])
    }
    const seen = new Set<string>()
    for (const ids of byCat.values()) {
      for (let i = 0; i < ids.length - 1 && seen.size < MAX_COMPARE; i++) {
        for (const j of [i + 1, i + 2]) {
          if (j >= ids.length) continue
          const href = compareHref(ids[i]!, ids[j]!)
          if (!seen.has(href)) {
            seen.add(href)
            urls.push(`<url><loc>${siteUrl}${href}</loc><changefreq>weekly</changefreq><priority>0.4</priority></url>`)
          }
        }
      }
    }
  } catch {
    // categories and compare pages are an extra: the product URLs above still go out
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}
</urlset>`
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=3600',
    },
  })
}
