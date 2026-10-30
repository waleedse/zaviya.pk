import { describe, expect, it } from 'vitest'
import { amortisation, emi, loanSummary } from '../../src/lib/loan-emi'

describe('loan EMI maths', () => {
  it('matches the standard reducing-balance formula', () => {
    // 1,000,000 at 12% for 12 months: 88,848.79
    expect(emi(1_000_000, 12, 12)).toBeCloseTo(88_848.79, 1)
    // 3,000,000 at 15% for 60 months: 71,364.31
    expect(emi(3_000_000, 15, 60)).toBeCloseTo(71_364.31, 0)
  })
  it('handles zero rate and bad input', () => {
    expect(emi(120_000, 0, 12)).toBe(10_000)
    expect(emi(0, 12, 12)).toBe(0)
    expect(emi(100, 12, 0)).toBe(0)
  })
  it('amortisation ends at zero and principal sums to the loan', () => {
    const rows = amortisation(1_000_000, 12, 12)
    expect(rows).toHaveLength(12)
    expect(rows[11].balance).toBe(0)
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBeCloseTo(1_000_000, 4)
    expect(rows[0].interest).toBeCloseTo(10_000, 4)
  })
  it('summary totals', () => {
    const s = loanSummary(1_000_000, 12, 12)
    expect(s.total).toBeCloseTo(s.monthly * 12, 6)
    expect(s.interest).toBeCloseTo(s.total - 1_000_000, 6)
  })
})
