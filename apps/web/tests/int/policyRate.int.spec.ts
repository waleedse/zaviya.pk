import { describe, expect, it } from 'vitest'
import { MPC_DATES_FY27, nextMpc, POLICY } from '../../src/lib/policy-rate'

describe('policy rate page data', () => {
  it('finds the next MPC, keeping the meeting day itself', () => {
    expect(nextMpc(new Date('2026-10-25T10:00:00Z'))).toBe('2026-10-26')
    expect(nextMpc(new Date('2026-10-26T02:00:00Z'))).toBe('2026-10-26')
    expect(nextMpc(new Date('2026-10-26T20:00:00Z'))).toBe('2026-12-14')
  })
  it('is null after the last meeting', () => {
    expect(nextMpc(new Date('2027-06-18T00:00:00Z'))).toBeNull()
  })
  it('has a sane corridor and sorted dates', () => {
    expect(POLICY.corridorFloor).toBeLessThan(POLICY.rate)
    expect(POLICY.corridorCeiling).toBeGreaterThan(POLICY.rate)
    expect([...MPC_DATES_FY27]).toEqual([...MPC_DATES_FY27].sort())
  })
})
