import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHARE_BRAND, SHARE_DOMAIN, shareLine, shareText } from '../../src/lib/share-text'

describe('share text (ZAV-300)', () => {
  it('headline, brand string, then the URL on its own line', () => {
    expect(shareText('SBP cuts rate by 100bps', 'https://zaviya.pk/business/sbp?utm_source=whatsapp&utm_medium=share')).toBe(
      'SBP cuts rate by 100bps - Zaviya News (zaviya.pk)\nhttps://zaviya.pk/business/sbp?utm_source=whatsapp&utm_medium=share',
    )
    expect(SHARE_BRAND).toBe('Zaviya News (zaviya.pk)')
  })
  it('Roman Urdu / Urdu headlines get the same brand and keep their text', () => {
    expect(shareLine('  Petrol  ki qeemat   kam  ')).toBe('Petrol ki qeemat kam - Zaviya News (zaviya.pk)')
    expect(shareLine('پیٹرول سستا')).toBe('پیٹرول سستا - Zaviya News (zaviya.pk)')
  })
})

describe('share card and share bar wiring', () => {
  const src = (f: string) => readFileSync(join(__dirname, '../../src', f), 'utf8')
  it('the share card prints the domain in its footer', () => {
    expect(SHARE_DOMAIN).toBe('zaviya.pk')
    expect(src('lib/share-card.tsx')).toContain('{SHARE_DOMAIN}')
  })
  it('WhatsApp, X, native and picture shares use the branded text and still track clicks', () => {
    const bar = src('components/article/ShareBar.tsx')
    expect(bar).toContain("shareText(title, utm('whatsapp'))")
    expect(bar).toContain('shareLine(title)')
    expect(bar).toContain("track('whatsapp')")
    expect(bar).toContain("trackShare('picture', path)")
    expect(bar).toContain("trackShare('native', path)")
  })
})
