import { DATA_PAGES } from '@zaviya/shared'
import { describe, expect, it } from 'vitest'
import {
  dayChange,
  dayDescription,
  dayTitle,
  formatRs,
  isRateDate,
  neighbourDays,
  rateDayPath,
  rateDayRange,
  rateFamilyBySlug,
  RATE_FAMILIES,
  summariseDay,
  type DayPoint,
} from '../../src/lib/rate-history'

const pt = (series: string, value: number, observedAt: string): DayPoint => ({ series, value, unit: 'PKR/litre', source: 'Govt notification', observedAt })

describe('dated rate pages', () => {
  it('has a family for every data page and none for LPG (no LPG series is stored)', () => {
    for (const d of DATA_PAGES) expect(RATE_FAMILIES.some((f) => f.key === d.key && f.slug === d.slug)).toBe(true)
    expect(RATE_FAMILIES.some((f) => /lpg/i.test(f.slug))).toBe(false)
  })
  it('builds the URL and validates the date', () => {
    const f = rateFamilyBySlug('petrol-price-today-pakistan')!
    expect(rateDayPath(f, '2026-11-03')).toBe('/petrol-price-today-pakistan/2026-11-03')
    expect(isRateDate('2026-11-03')).toBe(true)
    expect(isRateDate('2026-02-30')).toBe(false)
    expect(isRateDate('history')).toBe(false)
    expect(rateDayRange('2026-11-03').start).toBe('2026-11-02T19:00:00.000Z')
  })
  it('summarises a day: open, close, range, count', () => {
    const f = rateFamilyBySlug('petrol-price-today-pakistan')!
    const rows = summariseDay(f, [pt('petrol_super', 374.51, '2026-11-03T05:00:00Z'), pt('petrol_super', 369.06, '2026-11-03T18:00:00Z'), pt('hsd', 380, '2026-11-03T05:00:00Z')])
    const p = rows.find((r) => r.series === 'petrol_super')!
    expect(p).toMatchObject({ open: 374.51, close: 369.06, low: 369.06, high: 374.51, readings: 2 })
    expect(rows).toHaveLength(2)
    expect(summariseDay(f, [pt('usd_interbank', 280, '2026-11-03T05:00:00Z')])).toEqual([])
  })
  it('title and description carry the date and the closing figure', () => {
    const f = rateFamilyBySlug('petrol-price-today-pakistan')!
    const rows = summariseDay(f, [pt('petrol_super', 369.06, '2026-11-03T18:00:00Z')])
    expect(dayTitle(f, '2026-11-03', rows)).toBe('Petrol price in Pakistan on 3 November 2026: Rs 369.06 per litre')
    expect(dayDescription(f, '2026-11-03', rows)).toContain('3 November 2026')
    expect(formatRs(485000)).toBe('Rs 485,000')
  })
  it('change versus the previous day, none without one', () => {
    expect(dayChange(369.06, 374.51)).toEqual({ change: -5.45, pct: -1.46 })
    expect(dayChange(10, undefined)).toBeNull()
  })
  it('previous/next skip days without data', () => {
    const days = ['2026-11-04', '2026-11-03', '2026-10-30']
    expect(neighbourDays(days, '2026-11-03')).toEqual({ next: '2026-11-04', prev: '2026-10-30' })
    expect(neighbourDays(days, '2026-11-04')).toEqual({ next: undefined, prev: '2026-11-03' })
    expect(neighbourDays(days, '2026-11-01')).toEqual({})
  })
})
