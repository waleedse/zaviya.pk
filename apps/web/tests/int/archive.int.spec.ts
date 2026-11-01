import { describe, expect, it } from 'vitest'
import { archiveDateLabel, archiveDayRange, isArchiveDate, isServedArchiveDate, recentArchiveDates } from '../../src/lib/archive'

describe('daily archive dates (ZAV-281)', () => {
  it('accepts only real calendar dates', () => {
    expect(isArchiveDate('2026-11-01')).toBe(true)
    expect(isArchiveDate('2026-02-30')).toBe(false)
    expect(isArchiveDate('2026-1-1')).toBe(false)
    expect(isArchiveDate('latest')).toBe(false)
  })
  it('a Pakistan day runs from 19:00Z the day before', () => {
    expect(archiveDayRange('2026-11-01')).toEqual({ start: '2026-10-31T19:00:00.000Z', end: '2026-11-01T19:00:00.000Z' })
  })
  it('recent dates start at the Pakistan today (after 19:00Z it is already tomorrow)', () => {
    expect(recentArchiveDates(new Date('2026-11-01T10:00:00Z'), 3)).toEqual(['2026-11-01', '2026-10-31', '2026-10-30'])
    expect(recentArchiveDates(new Date('2026-11-01T20:00:00Z'), 2)).toEqual(['2026-11-02', '2026-11-01'])
    expect(recentArchiveDates(new Date('2026-11-01T10:00:00Z')).length).toBe(60)
  })
  it('serves only today and the previous 59 days', () => {
    const now = new Date('2026-11-01T10:00:00Z')
    expect(isServedArchiveDate('2026-11-01', now)).toBe(true)
    expect(isServedArchiveDate('2026-11-02', now)).toBe(false)
    expect(isServedArchiveDate('2026-09-03', now)).toBe(true)
    expect(isServedArchiveDate('2026-09-02', now)).toBe(false)
  })
  it('labels the day', () => {
    expect(archiveDateLabel('2026-11-01', 'en')).toBe('1 November 2026')
  })
})
