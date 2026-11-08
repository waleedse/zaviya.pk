import { describe, expect, it } from 'vitest'
import { MONTHLY_BASKET, cityBaskets, itemSpreads } from '@/lib/appliances/basket'
import type { ApplianceView } from '@/lib/appliances/logic'

const item = (slug: string, prices: Record<string, number>): ApplianceView => ({
  id: slug,
  slug,
  name: slug,
  brand: { slug: 'pbs', name: 'Pakistan Bureau of Statistics', kind: 'source' },
  category: { slug: 'atta-rice', name: 'Atta', singular: 'Staple', ur: 'آٹا', group: 'groceries' },
  cityPrices: Object.entries(prices).map(([city, avg]) => ({ city, min: avg, avg, max: avg })),
  hotScore: 0,
  pricePkr: 1,
  listPricePkr: null,
  inStock: true,
  officialUrl: 'https://www.pbs.gov.pk/',
  specs: [],
  priceHistory: [],
  popularity: 1,
})

describe('city basket', () => {
  const items = MONTHLY_BASKET.map((b) => item(b.slug, { Lahore: 100, Karachi: 120, Quetta: 110 }))
  items[0] = item('atta-20kg-price', { Lahore: 3000, Karachi: 3400, Quetta: 3100, Sukkur: 2900 })
  it('ranks cities by the basket total and skips a city that misses an item', () => {
    const b = cityBaskets(items)
    expect(b.map((x) => x.city)).toEqual(['Lahore', 'Quetta', 'Karachi'])
    expect(b[0]!.lines['atta-20kg-price']).toBe(6000)
  })
  it('finds the cheapest and costliest city per item', () => {
    const s = itemSpreads(items).find((x) => x.item.slug === 'atta-20kg-price')!
    expect([s.cheapest.city, s.costliest.city, s.gapPct]).toEqual(['Sukkur', 'Karachi', 17])
  })
})
