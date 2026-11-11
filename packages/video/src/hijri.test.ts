import { describe, expect, it } from 'vitest'
import { formatDates, shortDate } from './hijri'

describe('formatDates', () => {
  it('formats the Gregorian and Hijri date in Pakistan time', () => {
    expect(formatDates('2026-10-17T03:00:00Z')).toBe('SAT 17 OCT · 5 JUMADA I')
  })
  it('uses the Pakistan calendar day, not UTC', () => {
    expect(formatDates('2026-10-16T20:30:00Z')).toContain('SAT 17 OCT')
  })
  it('follows the Pakistan moon sighting (Jumada II 1448 began 12 Nov 2026)', () => {
    expect(formatDates('2026-11-11T12:00:00Z')).toBe('WED 11 NOV · 30 JUMADA I')
    expect(formatDates('2026-11-12T12:00:00Z')).toBe('THU 12 NOV · 1 JUMADA II')
  })
  it('has no year or AH', () => {
    expect(formatDates('2026-10-17T03:00:00Z')).not.toMatch(/AH|\d{4}/)
  })
  it('shortDate', () => {
    expect(shortDate('2026-10-17T03:00:00Z')).toBe('17 OCT')
  })
})
