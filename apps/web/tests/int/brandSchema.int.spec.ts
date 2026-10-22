import { describe, expect, it } from 'vitest'
import { openSearchXml, aboutPageJsonLd, organizationId, organizationJsonLd, SECTION_SEO, socialProfileUrls, websiteJsonLd } from '../../src/lib/seo'

describe('brand entity (ZAV-100)', () => {
  it('titles the homepage "Zaviya News: ..." within 50-65 characters', () => {
    const t = SECTION_SEO.home!.en.title
    expect(t.startsWith('Zaviya News: ')).toBe(true)
    expect(t.length).toBeGreaterThanOrEqual(50)
    expect(t.length).toBeLessThanOrEqual(65)
  })
  it('names the brand and the domain once each in the homepage title (ZAV-181)', () => {
    const t = SECTION_SEO.home!.en.title
    expect(t.match(/Zaviya News/g)).toHaveLength(1)
    expect(t.match(/zaviya\.pk/g)).toHaveLength(1)
  })
  it('serves an OpenSearch description pointing at the real search page and the WebSite SearchAction matches it (ZAV-181)', () => {
    const xml = openSearchXml()
    expect(xml).toMatch(/<ShortName>Zaviya News<\/ShortName>/)
    const template = xml.match(/template="([^"]+)"/)![1]!
    expect(template).toMatch(/^https?:\/\/[^/]+\/search\?q=\{searchTerms\}$/)
    const action = (websiteJsonLd('en') as Record<string, any>).potentialAction
    expect(action['@type']).toBe('SearchAction')
    expect(action.target.replace('{search_term_string}', '{searchTerms}')).toBe(template)
    expect(xml.startsWith('<?xml')).toBe(true)
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
    expect(a.url).toMatch(/\/about$/)
    expect(a.about['@id']).toBe(organizationId())
    expect(a.about.name).toBe('Zaviya News')
    expect(a.about.alternateName).toEqual(['Zaviya', 'Zaviya.pk'])
  })
  it('lists the official profiles from SOCIAL_PROFILE_URLS as sameAs, https only', () => {
    const prev = process.env.SOCIAL_PROFILE_URLS
    process.env.SOCIAL_PROFILE_URLS = 'https://x.com/zaviya, http://bad.example, https://facebook.com/zaviya ,'
    try {
      expect(socialProfileUrls()).toEqual(['https://x.com/zaviya', 'https://facebook.com/zaviya'])
      expect((aboutPageJsonLd('en') as Record<string, any>).about.sameAs).toEqual(socialProfileUrls())
    } finally {
      if (prev === undefined) delete process.env.SOCIAL_PROFILE_URLS
      else process.env.SOCIAL_PROFILE_URLS = prev
    }
  })
  it('adds the WhatsApp Channel to sameAs only when it is set (ZAV-157)', () => {
    const prev = process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL
    const prevSocial = process.env.SOCIAL_PROFILE_URLS
    process.env.SOCIAL_PROFILE_URLS = 'https://x.com/zaviya'
    try {
      delete process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL
      expect(socialProfileUrls()).toEqual(['https://x.com/zaviya'])
      process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/abc'
      expect(socialProfileUrls()).toEqual(['https://x.com/zaviya', 'https://whatsapp.com/channel/abc'])
      expect((organizationJsonLd() as Record<string, any>).sameAs).toContain('https://whatsapp.com/channel/abc')
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL
      else process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL = prev
      if (prevSocial === undefined) delete process.env.SOCIAL_PROFILE_URLS
      else process.env.SOCIAL_PROFILE_URLS = prevSocial
    }
  })
})
