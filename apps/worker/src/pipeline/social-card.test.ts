import { describe, it, expect } from 'vitest'
import {
  truncateForCard,
  categoryAccentColor,
  SOCIAL_CARD_SIZES,
} from './social-card.js'

describe('social-card helpers', () => {
  it('truncates long headlines with ellipsis', () => {
    const long = 'A'.repeat(200)
    const out = truncateForCard(long, 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps short text unchanged', () => {
    expect(truncateForCard('  Hello   world  ', 80)).toBe('Hello world')
  })

  it('resolves category accent from shared catalog', () => {
    expect(categoryAccentColor('business')).toBe('#B8902B')
    expect(categoryAccentColor('unknown-slug')).toBe('#0e7c5a')
  })

  it('defines OG and portrait dimensions', () => {
    expect(SOCIAL_CARD_SIZES.og).toEqual({ width: 1200, height: 630 })
    expect(SOCIAL_CARD_SIZES.portrait).toEqual({ width: 1080, height: 1350 })
  })
})

describe('photo cards', () => {
  it('shrinks the headline as it gets longer', async () => {
    const { photoTitleSize } = await import('./social-card.js')
    expect(photoTitleSize('Short', 'portrait')).toBeGreaterThan(photoTitleSize('x'.repeat(120), 'portrait'))
    expect(photoTitleSize('Short', 'og')).toBeGreaterThan(photoTitleSize('x'.repeat(100), 'og'))
  })

  it('only embeds jpeg and png photos', async () => {
    const { photoDataUrl } = await import('./social-card.js')
    expect(await photoDataUrl(new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }))).toBe('data:image/jpeg;base64,AQI=')
    expect(await photoDataUrl(new Blob([new Uint8Array([1])], { type: 'image/webp' }))).toBeNull()
    expect(await photoDataUrl(null)).toBeNull()
  })
})
