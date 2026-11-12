import { describe, expect, it } from 'vitest'
import { enoughSources, officialDomainsFor, type Pick2 } from './trend-gap.js'

const official = (id = '99'): Pick2 => ({
  hit: { title: 'Rain forecast', headline: 'Rain forecast', outlet: 'PMD', outletHost: 'www.pmd.gov.pk', link: 'https://news.google.com/x', publishedAt: new Date().toISOString() } as Pick2['hit'],
  match: { source: { id, name: 'Official sites (via Google News)', trustTier: 1 } as never, official: true },
  lang: 'en',
})
const outlet: Pick2 = { ...official('1'), match: { source: { id: '1', name: 'Dawn', trustTier: 1 } as never, official: false } }

describe('one official source is enough for weather and government data (ZG-21)', () => {
  it('lets a lone PMD item through for weather, FBR, SBP and BISP topics', () => {
    expect(enoughSources([official()], 'weather tomorrow')).toBe(true)
    expect(enoughSources([official()], 'karachi weather')).toBe(true)
    expect(enoughSources([official()], 'fbr deadline')).toBe(true)
    expect(enoughSources([official()], 'bisp 8171')).toBe(true)
  })
  it('still needs two outlets for everything else, and a lone ordinary outlet is never enough', () => {
    expect(enoughSources([official()], 'imran khan')).toBe(false)
    expect(enoughSources([official()])).toBe(false)
    expect(enoughSources([outlet], 'weather tomorrow')).toBe(false)
  })
  it('searches the PMD site for weather topics', () => {
    expect(officialDomainsFor('weather tomorrow')).toContain('pmd.gov.pk')
    expect(officialDomainsFor('karachi rain forecast')).toContain('pmd.gov.pk')
  })
})
