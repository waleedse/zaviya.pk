import { describe, expect, it } from 'vitest'
import { change, CHICKEN, CITIES, TREND } from '../../src/lib/chicken-price'

describe('chicken price data', () => {
  it('week-on-week and year-on-year match the national figures', () => {
    expect(change(CHICKEN.nationalAvg, CHICKEN.previousWeek)).toBe(48.29)
    expect(Math.round((CHICKEN.nationalAvg / CHICKEN.previousWeek - 1) * 10000) / 100).toBe(CHICKEN.wowPct)
    expect(Math.round((CHICKEN.nationalAvg / CHICKEN.yearAgo - 1) * 10000) / 100).toBe(CHICKEN.yoyPct)
  })
  it('has 17 cities, dearest first, and the trend ends on the national average', () => {
    expect(CITIES).toHaveLength(17)
    expect(CITIES[0]!.now).toBe(Math.max(...CITIES.map((c) => c.now)))
    expect(TREND.at(-1)!.value).toBe(CHICKEN.nationalAvg)
  })
})
