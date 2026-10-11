import { describe, expect, it } from 'vitest'
import { isDue, isNight, todayAt } from './schedule.js'

// 2026-10-12 09:30 PKT = 04:30 UTC
const at0930 = new Date('2026-10-12T04:30:00Z')

describe('schedule', () => {
  it('runs a daily slot once after its time', () => {
    const slot = { session: 'standup', at: '09:00' }
    expect(isDue(slot, at0930, 0)).toBe(true)
    expect(isDue(slot, at0930, todayAt(at0930, '09:00') + 60_000)).toBe(false)
    expect(isDue(slot, new Date('2026-10-12T03:30:00Z'), 0)).toBe(false) // 08:30 PKT
    expect(isDue(slot, new Date('2026-10-12T09:00:00Z'), 0)).toBe(false) // 14:00 PKT, window passed
  })

  it('respects weekdays', () => {
    // 2026-10-12 is a Monday
    expect(isDue({ session: 'weekly', at: '09:00', days: [1] }, at0930, 0)).toBe(true)
    expect(isDue({ session: 'strategy', at: '09:00', days: [0] }, at0930, 0)).toBe(false)
  })

  it('uses the night gap between 01:00 and 07:00 PKT', () => {
    const night = new Date('2026-10-11T22:00:00Z') // 03:00 PKT
    expect(isNight(night)).toBe(true)
    const slot = { session: 'hourly', every: 60, nightEvery: 180 }
    expect(isDue(slot, night, night.getTime() - 90 * 60_000)).toBe(false)
    expect(isDue(slot, at0930, at0930.getTime() - 90 * 60_000)).toBe(true)
  })
})
