import { PRODUCTS_INDEX } from '@zaviya/shared'
import { meili, meiliConfigured } from '@/lib/search/meili'

/**
 * /product-sitemap.xml: every product page Google may index (sold by 2+ stores, same rule as the noindex
 * in /product/[id]). Without it the 70k+ product pages were undiscoverable. One file holds at most 50,000 URLs.
 */
export const dynamic = 'force-dynamic'
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const MAX_URLS = 45_000
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
