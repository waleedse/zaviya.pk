import { describe, expect, it } from 'vitest'
import { formatRs, PRIZE_BOND_DRAWS_2026, upcomingDraws } from '../../src/lib/prize-bonds'

describe('prize bond schedule', () => {
  it('lists only future draws, soonest first', () => {
    const u = upcomingDraws(new Date('2026-10-17T06:00:00Z'))
    expect(u[0]).toMatchObject({ date: '2026-11-16', denomination: 1500, city: 'Hyderabad' })
    expect(u.every((d) => d.date >= '2026-10-17')).toBe(true)
  })
  it('keeps a draw on its own day', () => {
    expect(upcomingDraws(new Date('2026-10-15T03:00:00Z'))[0]).toMatchObject({ denomination: 750, drawNo: 108 })
  })
  it('puts the 10 Dec Rs25,000 draw in Karachi', () => {
    expect(PRIZE_BOND_DRAWS_2026.find((d) => d.denomination === 25000)?.city).toBe('Karachi')
  })
  it('is empty after the last draw', () => {
    expect(upcomingDraws(new Date('2026-12-20T00:00:00Z'))).toEqual([])
  })
  it('formats rupees', () => {
    expect(formatRs(40000)).toBe('Rs40,000')
  })
})
