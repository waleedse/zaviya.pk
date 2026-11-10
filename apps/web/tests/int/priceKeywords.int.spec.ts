import { describe, expect, it, vi } from 'vitest'
import type { ApplianceView } from '../../src/lib/appliances/logic'
import { CITY_PAGE_ITEMS, citySlug, cityPages, cityTitle, cityView, hasCityPages } from '../../src/lib/appliances/cities'
import { TITLE_MAX, itemH1, itemTitle, modelYear } from '../../src/lib/appliances/searchNames'

const cities = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi'].map((city, i) => ({ city, avg: 300 + i * 20, min: 280 + i * 20, max: 330 + i * 20 }))
const pbs = (slug: string, name: string, extra: Partial<ApplianceView> = {}): ApplianceView => ({
  id: slug,
  slug,
  name,
  unit: '1 dozen',
  brand: { slug: 'pbs', name: 'PBS', kind: 'source' },
  category: { slug: 'meat-chicken-eggs', name: 'Meat, Chicken & Eggs', singular: 'Item', ur: '', group: 'groceries' },
  cityPrices: cities,
  hotScore: 0,
  pricePkr: 330,
  listPricePkr: null,
  inStock: null,
  officialUrl: 'https://www.pbs.gov.pk/x/',
  specs: [],
  priceHistory: [],
  popularity: 50,
  ...extra,
})
const bike = (slug: string, name: string): ApplianceView => ({
  ...pbs(slug, name),
  brand: { slug: 'honda', name: 'Honda', kind: 'store' },
  category: { slug: 'motorcycles', name: 'Motorcycles', singular: 'Motorcycle', ur: '', group: 'vehicles' },
  cityPrices: [],
  pricePkr: 200000,
})

describe('price titles in searchers words', () => {
  it('Honda 70 and 125 use the searched name, model year and keep the official model', () => {
    expect(itemTitle(bike('honda-cd-70', 'CD 70'), 'November 2026', 2027)).toBe('Honda 70 Price in Pakistan 2027 Model (CD 70) Today')
    expect(itemH1(bike('honda-cg-125', 'CG 125'), 2027)).toBe('Honda 125 price in Pakistan 2027 model (CG 125)')
    expect(itemTitle(bike('honda-cb-150f', 'CB 150F'), 'November 2026')).toBe('Honda CB 150F Price in Pakistan November 2026')
  })
  it('model year rolls over in October', () => {
    expect(modelYear(new Date('2026-11-11'))).toBe(2027)
    expect(modelYear(new Date('2026-06-01'))).toBe(2026)
  })
  it('grocery titles say rate/price today, keep the month and stay short', () => {
    const egg = itemTitle(pbs('eggs-price', 'Eggs (Farm) per Dozen'), 'November 2026')
    expect(egg.startsWith('Egg Rate Today in Pakistan (November 2026)')).toBe(true)
    expect(egg).toContain('Lahore')
    expect(egg.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(itemTitle(pbs('atta-20kg-price', 'Atta (Wheat Flour) 20 kg Bag'), 'November 2026')).toMatch(/^Atta Price Today in Pakistan \(20 kg, November 2026\)/)
    expect(itemTitle(pbs('live-chicken-price', 'Live Chicken'), 'November 2026')).toMatch(/^Chicken Rate Today/)
    expect(itemH1(pbs('eggs-price', 'Eggs (Farm) per Dozen'))).toBe('Egg Rate today in Pakistan')
  })
})

describe('city rate pages', () => {
  const egg = pbs('eggs-price', 'Eggs (Farm) per Dozen')
  it('only listed grocery items from PBS get city pages', () => {
    expect(hasCityPages(egg)).toBe(true)
    expect(hasCityPages(pbs('gold-rate', 'Gold'))).toBe(false)
    expect(hasCityPages(pbs('eggs-price', 'Eggs', { cityPrices: [] }))).toBe(false)
    expect(hasCityPages(bike('honda-cd-70', 'CD 70'))).toBe(false)
    expect(CITY_PAGE_ITEMS).toHaveLength(9)
  })
  it('gives the city numbers, the national average and the cheapest city', () => {
    const v = cityView(egg, citySlug('Lahore'))!
    expect(v.row).toMatchObject({ city: 'Lahore', min: 280, avg: 300, max: 330 })
    expect(v.national).toBe(330)
    expect(v.isCheapest).toBe(true)
    expect(v.costliest.city).toBe('Rawalpindi')
    expect(v.others.map((c) => c.city)).toEqual(['Karachi', 'Islamabad', 'Rawalpindi'])
    expect(v.vsNationalPct).toBe(-9)
    expect(cityView(egg, 'atlantis')).toBeNull()
    expect(cityTitle(egg, 'Lahore', 'November 2026')).toBe('Egg Rate Today in Lahore (November 2026)')
  })
  it('sitemap lists one URL per city per listed item and nothing for others', async () => {
    const all = [egg, pbs('gold-rate', 'Gold'), bike('honda-cd-70', 'CD 70')]
    expect(cityPages(all)).toHaveLength(4)
    vi.resetModules()
    vi.doMock('../../src/lib/appliances/queries', () => ({ getAppliances: async () => all }))
    const { applianceSitemapEntries } = await import('../../src/lib/appliances/sitemap')
    const urls = (await applianceSitemapEntries('https://zaviya.pk')).map((e) => e.url)
    expect(urls).toContain('https://zaviya.pk/prices/meat-chicken-eggs/eggs-price/lahore')
    expect(urls.filter((u) => u.includes('gold-rate/'))).toEqual([])
  })
})
