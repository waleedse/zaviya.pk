import { getPayloadClient } from '@/lib/payload'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
const publicationName = 'Zaviya'

export async function GET() {
  const payload = await getPayloadClient()
  const since = new Date(Date.now() - 48 * 3600_000).toISOString()
  const urls: string[] = []

  for (const locale of ['en', 'ur'] as const) {
    const articles = await payload.find({
      collection: 'articles',
      locale,
      where: {
        and: [
          { _status: { equals: 'published' } },
          { workflow: { not_equals: 'retracted' } },
          { publishedAt: { greater_than: since } },
        ],
      },
      sort: '-publishedAt',
      limit: 1000,
      depth: 1,
      overrideAccess: true,
    })
    for (const a of articles.docs) {
      const cat =
        typeof a.category === 'object' && a.category ? (a.category as { slug: string }).slug : 'news'
      const slug = String(a.slug ?? '')
      const loc = locale === 'ur' ? `${siteUrl}/ur/${cat}/${slug}` : `${siteUrl}/${cat}/${slug}`
      const lang = locale === 'ur' ? 'ur' : 'en'
      urls.push(`
  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>${publicationName}</news:name>
        <news:language>${lang}</news:language>
      </news:publication>
      <news:publication_date>${a.publishedAt ?? a.createdAt}</news:publication_date>
      <news:title>${escapeXml(String(a.title ?? ''))}</news:title>
    </news:news>
  </url>`)
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls.join('')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
