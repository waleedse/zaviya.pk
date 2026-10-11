import { describe, it, expect } from 'vitest'
import robots from '@/app/robots'
import { newsSitemapEntry } from '@/lib/news-sitemap'
import { newsArticleJsonLd, organizationJsonLd, logoUrl } from '@/lib/seo'

const SITE = 'https://zaviya.pk'

describe('news sitemap entries', () => {
  const english = { slug: 'sbp-rate', title: 'SBP holds rate', publishedAt: '2026-10-12T00:00:00Z', category: { slug: 'business' } }
  it('emits an English entry', () => {
    const e = newsSitemapEntry(english, 'en', SITE, 'Zaviya')!
    expect(e).toContain('<loc>https://zaviya.pk/business/sbp-rate</loc>')
    expect(e).toContain('<news:language>en</news:language>')
  })
  it('skips an English-only article for ur (empty slug and title)', () => {
    expect(newsSitemapEntry({ ...english, slug: '', title: '' }, 'ur', SITE, 'Zaviya')).toBeNull()
    expect(newsSitemapEntry({ ...english, slug: undefined, title: undefined }, 'ur', SITE, 'Zaviya')).toBeNull()
    expect(newsSitemapEntry({ ...english, title: '  ' }, 'ur', SITE, 'Zaviya')).toBeNull()
  })
  it('emits ur entry only with Urdu slug and title', () => {
    const e = newsSitemapEntry({ ...english, slug: 'rate', title: 'شرح سود' }, 'ur', SITE, 'Zaviya')!
    expect(e).toContain('/ur/business/rate')
    expect(e).toContain('<news:language>ur</news:language>')
  })
})

describe('robots', () => {
  it('allows /api/media/file/x.jpg despite the /api/ disallow (longest match wins)', () => {
    const rule = (robots().rules as { allow: string[]; disallow: string[] }[])[0]
    const path = '/api/media/file/x.jpg'
    const best = (list: string[]) => Math.max(-1, ...list.filter((p) => path.startsWith(p)).map((p) => p.length))
    expect(rule.allow).toContain('/api/media/')
    expect(best(rule.allow)).toBeGreaterThan(best(rule.disallow))
  })
})

describe('structured data', () => {
  const base = {
    title: 'T', dek: 'd', publishedAt: '2026-10-12T00:00:00Z', href: '/cricket/t', author: { name: 'Zaviya' },
    category: { slug: 'cricket', name: 'Cricket' },
  }
  it('falls back to the og image when there is no hero', () => {
    const ld = newsArticleJsonLd({ ...base, image: null } as never, 'en')
    expect(ld.image).toHaveLength(1)
    expect(ld.image[0]).toContain('/api/og?')
  })
  it('uses the hero image when present', () => {
    const ld = newsArticleJsonLd({ ...base, image: { url: '/api/media/file/a.jpg' } } as never, 'en')
    expect(ld.image[0]).toMatch(/\/api\/media\/file\/a\.jpg$/)
  })
  it('uses a PNG logo and alternateName', () => {
    expect(logoUrl()).toMatch(/\/logo\.png$/)
    expect(organizationJsonLd().alternateName).toEqual(['Zaviya News', 'زاویہ'])
    expect(newsArticleJsonLd({ ...base, image: null } as never, 'en').publisher.logo.url).toMatch(/logo\.png$/)
  })
})
