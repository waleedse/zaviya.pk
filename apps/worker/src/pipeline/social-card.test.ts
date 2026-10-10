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
