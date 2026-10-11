import { getPayloadClient } from '@/lib/payload'
import { newsSitemapEntry } from '@/lib/news-sitemap'

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
      // Never show English text under /ur: a missing translation must come back empty so it is skipped.
      fallbackLocale: false,
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
      const entry = newsSitemapEntry(a, locale, siteUrl, publicationName)
      if (entry) urls.push(entry)
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
