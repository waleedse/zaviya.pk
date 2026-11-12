import { describe, it, expect } from 'vitest'
import { isTrendMarked, TREND_GAP_MARK } from './trend-gap-mark.js'

describe('isTrendMarked', () => {
  it('is true for a trend-gap item or a Google Trends source, false for ordinary news', () => {
    expect(isTrendMarked([{ summary: `${TREND_GAP_MARK} budget 2026` }])).toBe(true)
    expect(isTrendMarked([{ summary: 'x', source: { name: 'Google Trends - Pakistan daily' } }])).toBe(true)
    expect(isTrendMarked([{ summary: 'x', source: { name: 'Dawn' } }])).toBe(false)
  })
})
