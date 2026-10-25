import { describe, expect, it } from 'vitest'
import { pickGulfRates } from '../../src/lib/gulf-rates'

const table: { label: string; values: Record<string, number> }[] = [
  { label: 'US Dollar (USD)', values: { market: 276.82, buy: 277.5, sell: 280.15 } },
  { label: 'Saudi Riyal (SAR)', values: { market: 73.82, buy: 73.8, sell: 74.4 } },
  { label: 'UAE Dirham (AED)', values: { market: 75.38 } },
]

describe('pickGulfRates', () => {
  it('returns SAR with buy and sell, skips AED without them', () => {
    expect(pickGulfRates(table)).toEqual([{ code: 'SAR', buy: 73.8, sell: 74.4, market: 73.82 }])
  })
  it('is empty without rows', () => {
    expect(pickGulfRates([])).toEqual([])
  })
})
