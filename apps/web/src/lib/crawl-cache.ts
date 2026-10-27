/** ZAV-229: edge caching for HTML and the sitemap window, kept in one place so it can be tested. */

/**
 * Cloudflare stamped its 4 h default max-age on pages that only had s-maxage, and a 60 s edge TTL made Googlebot hit
 * the slow origin most of the time. Browsers always revalidate; the edge keeps a page 5 min and may serve it up to 60 s
 * stale while it refreshes, so breaking news on the home page is never older than about 6 min.
 */
export const HTML_CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=60'

/** Paths that must not get the HTML header: API, admin, build assets, embeds, share cards and anything with a file extension. */
export const HTML_HEADER_SOURCE = '/((?!api|admin|_next|embed|card|.*\\..*).*)'

/** sitemap.xml lists articles from the last 7 days; older ones stay reachable through category, tag and latest pages. */
export const SITEMAP_ARTICLE_DAYS = 7

export const sitemapArticleCutoff = (now: Date = new Date()): string =>
  new Date(now.getTime() - SITEMAP_ARTICLE_DAYS * 24 * 3600 * 1000).toISOString()
