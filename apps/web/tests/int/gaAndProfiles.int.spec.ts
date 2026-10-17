import { describe, expect, it } from 'vitest'
import { DEFAULT_GA_ID } from '../../src/components/analytics/AnalyticsScripts'
import { OFFICIAL_PROFILE_URLS, organizationJsonLd, socialProfileUrls } from '../../src/lib/seo'

describe('GA and official profiles (ZAV-91)', () => {
  it('uses the Zaviya GA4 property by default', () => {
    expect(DEFAULT_GA_ID).toBe('G-XEDRHVVQS9')
  })
  it('lists the three official profiles in sameAs', () => {
    expect(socialProfileUrls(undefined)).toEqual(OFFICIAL_PROFILE_URLS)
    expect((organizationJsonLd() as { sameAs: string[] }).sameAs).toContain('https://x.com/zaviyapk')
  })
  it('lets SOCIAL_PROFILE_URLS replace them and ignores non-https entries', () => {
    expect(socialProfileUrls('https://a.example/x, http://b.example, ')).toEqual(['https://a.example/x'])
    expect(socialProfileUrls('')).toEqual(OFFICIAL_PROFILE_URLS)
  })
})
