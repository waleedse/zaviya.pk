export type NewsSitemapDoc = {
  slug?: unknown
  title?: unknown
  publishedAt?: unknown
  createdAt?: unknown
  category?: unknown
}

export type NewsLocale = 'en' | 'ur'

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * One <url> entry for the Google News sitemap, or null when the article has no slug or title in this
 * locale (e.g. an English-only article queried for `ur`). Such a doc must never produce a URL: it would
 * point at a category page with an empty title.
 */
export function newsSitemapEntry(doc: NewsSitemapDoc, locale: NewsLocale, siteUrl: string, publicationName: string): string | null {
  const slug = clean(doc.slug)
  const title = clean(doc.title)
  if (!slug || !title) return null
  const cat =
    typeof doc.category === 'object' && doc.category ? clean((doc.category as { slug?: unknown }).slug) || 'news' : 'news'
  const loc = locale === 'ur' ? `${siteUrl}/ur/${cat}/${slug}` : `${siteUrl}/${cat}/${slug}`
  const date = clean(doc.publishedAt) || clean(doc.createdAt)
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>${publicationName}</news:name>
        <news:language>${locale}</news:language>
      </news:publication>
      <news:publication_date>${date}</news:publication_date>
      <news:title>${escapeXml(title)}</news:title>
    </news:news>
  </url>`
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
