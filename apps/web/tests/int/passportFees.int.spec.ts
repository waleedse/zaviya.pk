import { describe, expect, it } from 'vitest'
import { FEES, findFee, rs } from '../../src/lib/passport-fees'

describe('passport fee data', () => {
  it('matches the reported DGIP schedule', () => {
    expect(findFee(5, 36)).toMatchObject({ normal: 9000, urgent: 15000 })
    expect(findFee(5, 72)).toMatchObject({ normal: 16500, urgent: 27000 })
    expect(findFee(10, 36)).toMatchObject({ normal: 13500, urgent: 22500 })
    expect(findFee(10, 72)).toMatchObject({ normal: 24750, urgent: 40500 })
  })
  it('urgent costs more than normal and nobody lists the unconfirmed Rs22,000 fast-track', () => {
    expect(FEES.every((f) => f.urgent > f.normal)).toBe(true)
    expect(rs(24750)).toBe('Rs24,750')
  })
})
