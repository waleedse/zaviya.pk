import { describe, expect, it } from 'vitest'
import { aboutPageJsonLd, organizationId, organizationJsonLd, SECTION_SEO, websiteJsonLd } from '../../src/lib/seo'

describe('brand entity (ZAV-100)', () => {
  it('titles the homepage "Zaviya News: ..." within 50-65 characters', () => {
    const t = SECTION_SEO.home!.en.title
    expect(t.startsWith('Zaviya News: ')).toBe(true)
    expect(t.length).toBeGreaterThanOrEqual(50)
    expect(t.length).toBeLessThanOrEqual(65)
  })
  it('gives the organization a stable id and the fields Google reads', () => {
    const o = organizationJsonLd() as Record<string, any>
    expect(o['@id']).toBe(organizationId())
    expect(o['@id']).toMatch(/\/#organization$/)
    expect(o.foundingDate).toBe('2026')
    expect(o.inLanguage).toEqual(['en', 'ur'])
    expect(o.logo).toMatchObject({ '@type': 'ImageObject', width: 512, height: 512 })
    expect(o.publishingPrinciples).toMatch(/\/p\/editorial-policy$/)
    expect(o.correctionsPolicy).toMatch(/\/p\/corrections$/)
    expect(JSON.parse(JSON.stringify(o))).toEqual(o)
  })
  it('points WebSite and AboutPage at the organization', () => {
    expect((websiteJsonLd('en') as Record<string, any>).publisher).toEqual({ '@id': organizationId() })
    const a = aboutPageJsonLd('en') as Record<string, any>
    expect(a['@type']).toBe('AboutPage')
    expect(a.about).toEqual({ '@id': organizationId() })
  })
})
