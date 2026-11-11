import { describe, expect, it } from 'vitest'
import { buildSearchIndex, cleanQuery, closestCategories, normalize, searchPrices, within } from '@/lib/appliances/search'
import { buildSeries, changeOver, chartState, latestMove, seriesStats } from '@/lib/appliances/series'
import { mergeHistoryPoints } from '@/lib/appliances/importer'
import type { ApplianceView } from '@/lib/appliances/logic'

const pbs = { slug: 'pbs', name: 'Pakistan Bureau of Statistics', kind: 'source' as const }
const base = (slug: string, name: string, price: number, extra: Partial<ApplianceView> = {}): ApplianceView => ({
  id: slug,
  slug,
  name,
  brand: pbs,
  category: { slug: 'meat-chicken-eggs', name: 'Meat, Chicken & Eggs', singular: 'Item', ur: 'گوشت، مرغی اور انڈے', group: 'groceries' },
  cityPrices: [],
  hotScore: 0,
  pricePkr: price,
  listPricePkr: null,
  inStock: null,
  officialUrl: 'https://www.pbs.gov.pk/x',
  specs: [],
  priceHistory: [],
  popularity: 50,
  ...extra,
})
const bike = (slug: string, name: string, price: number): ApplianceView =>
  base(slug, name, price, { brand: { slug: 'honda', name: 'Honda', kind: 'store' }, category: { slug: 'motorcycles', name: 'Motorcycles & Electric Bikes', singular: 'Motorcycle', ur: 'موٹر سائیکل', group: 'vehicles' }, model: name })
const fridge = (slug: string, name: string, price: number) =>
  base(slug, name, price, { brand: { slug: 'samsung', name: 'Samsung', kind: 'store' }, category: { slug: 'refrigerators', name: 'Refrigerators', singular: 'Refrigerator', ur: 'فریج', group: 'appliances' } })

const index = buildSearchIndex([
  base('eggs-price', 'Eggs (Farm) per Dozen', 280, { nameUr: 'انڈے', popularity: 85 }),
  base('sugar-price', 'Sugar 1 kg', 180, { category: { slug: 'sugar-tea-spices', name: 'Sugar, Tea, Salt & Spices', singular: 'Item', ur: 'چینی', group: 'groceries' } }),
  base('atta-20kg-price', 'Atta (Wheat Flour) 20 kg Bag', 2958, { category: { slug: 'atta-rice', name: 'Atta, Rice & Bread', singular: 'Staple', ur: 'آٹا', group: 'groceries' } }),
  base('beef-price', 'Beef with Bone 1 kg', 1286),
  bike('honda-cd-70', 'CD 70', 195000),
  bike('honda-cg-125', 'CG 125', 330000),
  fridge('samsung-rt38', 'Samsung Inverter Fridge 380L', 250000),
])

describe('price search', () => {
  it('finds eggs by the Roman Urdu word anda', () => {
    const r = searchPrices(index, 'anda')
    expect(r.items.map((i) => i.slug)).toEqual(['eggs-price'])
  })
  it('finds sugar by cheeni and atta by flour', () => {
    expect(searchPrices(index, 'cheeni rate').items[0]?.slug).toBe('sugar-price')
    expect(searchPrices(index, 'flour price').items[0]?.slug).toBe('atta-20kg-price')
  })
  it('finds Urdu script', () => {
    expect(searchPrices(index, 'انڈے').items[0]?.slug).toBe('eggs-price')
  })
  it('honda 70 is the CD 70 and not the CG 125', () => {
    const r = searchPrices(index, 'honda 70')
    expect(r.items.map((i) => i.slug)).toEqual(['honda-cd-70'])
  })
  it('bike and gari find their category', () => {
    expect(searchPrices(index, 'bike').categories[0]?.slug).toBe('motorcycles')
    expect(searchPrices(index, 'fridge price').categories[0]?.slug).toBe('refrigerators')
  })
  it('forgives a typo and says so', () => {
    const r = searchPrices(index, 'hnda 70')
    expect(r.fuzzy).toBe(true)
    expect(r.items[0]?.slug).toBe('honda-cd-70')
  })
  it('petrol points at the rate page, nothing else matches', () => {
    const r = searchPrices(index, 'petrol price today')
    expect(r.items).toEqual([])
    expect(r.pages[0]?.href).toBe('/petrol-price-today-pakistan')
  })
  it('no match gives closest categories to show', () => {
    expect(searchPrices(index, 'zzzqqq').total).toBe(0)
    expect(closestCategories(index, 'refrigrator')[0]?.slug).toBe('refrigerators')
    expect(closestCategories(index, 'zzzqqq').length).toBeGreaterThan(0)
  })
  it('helpers', () => {
    expect(normalize('  Honda   CD-70! ')).toBe('honda cd 70')
    expect(within('honda', 'hnda', 1)).toBe(true)
    expect(within('honda', 'toyota', 2)).toBe(false)
    expect(cleanQuery('Honda 70 Price')).toBe('honda 70 price')
    expect(cleanQuery('http://spam.com')).toBeNull()
    expect(cleanQuery('a')).toBeNull()
    expect(cleanQuery('x'.repeat(80))).toBeNull()
  })
})

const day = (d: string) => `${d}T08:00:00.000Z`
const NOW = Date.parse(day('2026-11-12'))

describe('price series', () => {
  it('carries the last price forward to the last check', () => {
    const s = buildSeries([{ date: day('2026-11-05'), pricePkr: 100 }], 100, day('2026-11-12'))
    expect(s.map((p) => p.real)).toEqual([true, false])
    expect(seriesStats(s)).toMatchObject({ spanDays: 7, changes: 0, unchangedDays: 7 })
    expect(chartState(s)).toBe('chart')
  })
  it('one fresh point is "tracking since"', () => {
    const s = buildSeries([{ date: day('2026-11-11') }, ].map((r) => ({ ...r, pricePkr: 100 })), 100, day('2026-11-12'))
    expect(chartState(s)).toBe('tracking')
    expect(chartState([])).toBe('none')
  })
  it('weekly and monthly change only where the record reaches back', () => {
    const s = buildSeries(
      [
        { date: day('2026-10-01'), pricePkr: 100 },
        { date: day('2026-11-08'), pricePkr: 120 },
      ],
      120,
      day('2026-11-12'),
    )
    expect(changeOver(s, 7, NOW)).toMatchObject({ from: 100, to: 120, pct: 20 })
    expect(changeOver(s, 30, NOW)).toMatchObject({ from: 100, pct: 20 })
    expect(changeOver(s, 90, NOW)).toBeNull()
    expect(latestMove(s, 14, NOW)).toMatchObject({ from: 100, to: 120, pct: 20 })
    expect(latestMove(s, 3, NOW)).toBeNull()
  })
})

describe('history backfill merge', () => {
  const pts = [
    { date: '2025-10-30', pricePkr: 2204, sourceUrl: 'https://pbs/1' },
    { date: '2026-11-05', pricePkr: 2958, sourceUrl: 'https://pbs/2' },
  ]
  it('adds missing weeks, skips a day or price already recorded, and never touches the current price', () => {
    const r = mergeHistoryPoints([{ date: '2026-11-06T10:00:00.000Z', pricePkr: 2958 }], pts)
    expect(r.added).toBe(1)
    expect(r.history.map((h) => h.date.slice(0, 10))).toEqual(['2025-10-30', '2026-11-06'])
    expect(mergeHistoryPoints(r.history, pts).added).toBe(0)
  })
})
