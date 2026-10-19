import { describe, it, expect } from 'vitest'
import robots from '@/app/robots'
import { newsSitemapEntry } from '@/lib/news-sitemap'
import { newsArticleJsonLd, organizationJsonLd, logoUrl, brandedTitle, buildPageMetadata, websiteJsonLd } from '@/lib/seo'

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
    expect(organizationJsonLd().alternateName).toEqual(['Zaviya', 'Zaviya.pk'])
    expect(newsArticleJsonLd({ ...base, image: null } as never, 'en').publisher.logo.url).toMatch(/logo\.png$/)
  })
})

describe('brand in titles and schema (ZAV-125)', () => {
  it('appends " | Zaviya News" when the whole title is within 65 characters', () => {
    expect(brandedTitle('SBP holds rate')).toBe('SBP holds rate | Zaviya News')
  })
  it('keeps a long headline whole, without the brand', () => {
    const long = 'Government announces a sweeping new package of relief measures for exporters'
    expect(long.length).toBeGreaterThan(60)
    expect(brandedTitle(long)).toBe(long)
  })
  it('fits exactly at 65 characters and not at 66', () => {
    const fit = 'x'.repeat(65 - ' | Zaviya News'.length)
    expect(brandedTitle(fit)).toBe(`${fit} | Zaviya News`)
    expect(brandedTitle(`${fit}y`)).toBe(`${fit}y`)
  })
  it('sets the branded title, plain og:title and og:site_name', () => {
    const m = buildPageMetadata({ locale: 'en', title: 'SBP holds rate', enPath: '/business/sbp' })
    expect(m.title).toEqual({ absolute: 'SBP holds rate | Zaviya News' })
    expect(m.openGraph?.title).toBe('SBP holds rate')
    expect((m.openGraph as { siteName?: string }).siteName).toBe('Zaviya News')
  })
  it('uses one brand name for Organization, WebSite and publisher', () => {
    const base = { title: 'T', dek: 'd', publishedAt: '2026-10-12T00:00:00Z', href: '/cricket/t', author: { name: 'Zaviya' }, category: { slug: 'cricket', name: 'Cricket' }, image: null }
    const org = organizationJsonLd() as Record<string, unknown>
    const site = websiteJsonLd('en') as Record<string, unknown>
    expect(org.name).toBe('Zaviya News')
    expect(site.name).toBe('Zaviya News')
    expect(site.alternateName).toEqual(['Zaviya', 'Zaviya.pk'])
    expect(newsArticleJsonLd(base as never, 'en').publisher.name).toBe('Zaviya News')
  })
})
