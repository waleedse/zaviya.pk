import { describe, it, expect } from 'vitest'
import { parseForexPk, goldTable, extractFuelPrices, agreedValue } from './rates.js'

describe('rates', () => {
  it('parses forex.pk rows', () => {
    const html = `<table><tr><td>US Dollar</td><td>USD</td><td>277.5</td><td>278.1</td></tr><tr><td>Saudi Riyal</td><td>SAR</td><td>73.9</td><td>74.3</td></tr><tr><td>US Dollar DD</td><td>USD-DD</td><td>1</td><td>2</td></tr></table>`
    expect(parseForexPk(html)).toEqual({ USD: { buy: 277.5, sell: 278.1 }, SAR: { buy: 73.9, sell: 74.3 } })
  })
  it('builds a karat table from spot price', () => {
    const t = goldTable(3000, 280)
    expect(t.map((r) => r.label)).toEqual(['24K', '22K', '21K', '18K'])
    // 3000 USD/oz -> 27,006 PKR/g at 280 -> ~315,000 per tola
    expect(t[0]!.values.tola).toBeGreaterThan(310_000)
    expect(t[0]!.values.tola).toBeLessThan(320_000)
    expect(t[1]!.values.gram).toBeLessThan(t[0]!.values.gram)
  })
  it('extracts fuel prices near fuel names only', () => {
    expect(extractFuelPrices('Petrol price cut by Rs5 to Rs254.63 per litre; diesel at Rs258.64')).toEqual({ petrol: 254.63, hsd: 258.64 })
    expect(extractFuelPrices('PSX gains 900 points, Rs280 dollar')).toEqual({})
  })
  it('requires two outlets to agree', () => {
    expect(agreedValue([{ value: 254.63, outlet: 'Dawn' }])).toBeNull()
    expect(agreedValue([{ value: 254.63, outlet: 'Dawn' }, { value: 254.63, outlet: 'Geo' }, { value: 250, outlet: 'X' }])).toBe(254.63)
  })
})
