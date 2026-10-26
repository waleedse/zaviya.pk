import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/queries', () => ({ getArticleBySlug: vi.fn() }))

import { rtlLines, shareCardDate, shareCardTitle, shareCardTitleSize } from '../../src/lib/share-card'
import { cardPath } from '../../src/components/article/ShareBar'

describe('share card helpers (ZAV-223)', () => {
  it('shrinks the headline for long titles and keeps it inside the card', () => {
    expect(shareCardTitleSize('short', false)).toBeGreaterThan(shareCardTitleSize('x'.repeat(120), false))
    expect(shareCardTitleSize('x'.repeat(120), true)).toBeLessThan(shareCardTitleSize('short', true))
    expect(shareCardTitle('a'.repeat(300)).length).toBe(150)
    expect(shareCardTitle('  two   spaces ')).toBe('two spaces')
  })
  it('dates in Pakistan time', () => {
    expect(shareCardDate('2026-10-26T20:30:00Z', 'en')).toBe('27 October 2026')
  })
  it('Urdu: wraps by words and reverses each line, because next/og lays words out left to right', () => {
    expect(rtlLines('a b c d', 3)).toEqual(['b a', 'd c'])
    expect(rtlLines('one', 99)).toEqual(['one'])
    expect(rtlLines('   ', 10)).toEqual([])
  })
  it('card URL from the article path, per language', () => {
    expect(cardPath('en', '/business/sbp-rate-cut')).toBe('/card/sbp-rate-cut.png')
    expect(cardPath('ur', '/ur/business/sbp-rate-cut')).toBe('/card/ur/sbp-rate-cut.png')
  })
})
