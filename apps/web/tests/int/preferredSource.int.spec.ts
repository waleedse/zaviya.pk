import { describe, expect, it } from 'vitest'
import { SHARE_CHANNELS, shareSource } from '../../src/lib/analytics'
import { PREFERRED_SOURCE_COPY, PREFERRED_SOURCE_URL } from '../../src/lib/preferred-source'

describe('preferred source prompt (ZAV-241)', () => {
  it('links to the official Google preferred-sources deep link for zaviya.pk', () => {
    const u = new URL(PREFERRED_SOURCE_URL)
    expect(u.origin + u.pathname).toBe('https://www.google.com/preferences/source')
    expect(u.searchParams.get('q')).toBe('zaviya.pk')
  })
  it('click is accepted by the analytics route and logged as preferred_source_click', () => {
    expect(SHARE_CHANNELS).toContain('preferred_source')
    expect(shareSource('preferred_source')).toBe('preferred_source_click')
    expect(shareSource('whatsapp')).toBe('whatsapp-share')
  })
  it('has English copy with a Roman Urdu line, and Urdu copy', () => {
    expect(PREFERRED_SOURCE_COPY.en.title).toContain('preferred source on Google')
    expect(PREFERRED_SOURCE_COPY.en.roman).toMatch(/Zaviya/)
    expect(PREFERRED_SOURCE_COPY.ur.title).toContain('زاویہ')
  })
})
