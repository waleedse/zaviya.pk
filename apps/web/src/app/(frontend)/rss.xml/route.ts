import { getPayloadClient } from '@/lib/payload'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

async function buildRss(locale: 'en' | 'ur') {
  const payload = await getPayloadClient()
  const articles = await payload.find({
    collection: 'articles',
    locale,
    where: {
      and: [{ _status: { equals: 'published' } }, { workflow: { not_equals: 'retracted' } }],
    },
    sort: '-publishedAt',
    limit: 50,
    depth: 1,
    overrideAccess: true,
  })

  const items = articles.docs
    .map((a) => {
      const cat =
        typeof a.category === 'object' && a.category ? (a.category as { slug: string }).slug : 'news'
      const slug = String(a.slug ?? '')
      const link = locale === 'ur' ? `${siteUrl}/ur/${cat}/${slug}` : `${siteUrl}/${cat}/${slug}`
      return `
    <item>
      <title>${escapeXml(String(a.title ?? ''))}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(a.publishedAt ?? a.createdAt).toUTCString()}</pubDate>
      <description>${escapeXml(String(a.dek ?? ''))}</description>
    </item>`
    })
    .join('')

  const title = locale === 'ur' ? 'زاویہ — تازہ ترین خبریں' : 'Zaviya — Latest News'
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <link>${siteUrl}${locale === 'ur' ? '/ur' : ''}</link>
    <description>Every story, the right angle</description>
    <language>${locale === 'ur' ? 'ur-pk' : 'en-pk'}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}

export async function GET() {
  return buildRss('en')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export { buildRss }
