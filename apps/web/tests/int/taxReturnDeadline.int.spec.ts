import { describe, expect, it } from 'vitest'
import { DEADLINE, daysToDeadline } from '../../src/lib/tax-return-deadline'

describe('tax return deadline page data', () => {
  it('counts days in Pakistan time', () => {
    expect(daysToDeadline(new Date('2026-10-26T10:00:00Z'))).toBe(5)
    expect(daysToDeadline(new Date('2026-10-30T20:00:00Z'))).toBe(0)
    expect(daysToDeadline(new Date('2026-11-02T00:00:00Z'))).toBeLessThan(0)
  })
  it('keeps the new date after the old one', () => {
    expect(DEADLINE.date > DEADLINE.previousDate).toBe(true)
  })
})
