import { describe, expect, it } from 'vitest'
import { HTML_CACHE_CONTROL, HTML_HEADER_SOURCE, sitemapArticleCutoff } from '../../src/lib/crawl-cache'

describe('crawl cache (ZAV-229)', () => {
  it('edge caches 5 min, browser always revalidates, stale window under a minute', () => {
    expect(HTML_CACHE_CONTROL).toContain('s-maxage=300')
    expect(HTML_CACHE_CONTROL).toContain('max-age=0')
    expect(HTML_CACHE_CONTROL).toContain('stale-while-revalidate=60')
  })
  it('header source covers pages but not api, admin, assets or files', () => {
    // Next compiles the source with path-to-regexp; the group is a plain regex, so test it directly
    const re = new RegExp(`^${HTML_HEADER_SOURCE.replace(/^\//, '\\/')}$`)
    for (const ok of ['/', '/latest', '/tag/cricket', '/ur/pakistan', '/pakistan/some-story']) expect(re.test(ok), ok).toBe(true)
    for (const no of ['/api/pipeline/x', '/admin/collections', '/_next/static/a.js', '/card/x.png', '/embed/rates', '/sitemap.xml', '/rss.xml']) expect(re.test(no), no).toBe(false)
  })
  it('sitemap cutoff is exactly 7 days back', () => {
    expect(sitemapArticleCutoff(new Date('2026-10-27T12:00:00Z'))).toBe('2026-10-20T12:00:00.000Z')
  })
})
