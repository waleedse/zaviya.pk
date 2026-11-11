import { describe, expect, it, vi } from 'vitest'

// the search box uses the app router; static rendering has none
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }), notFound: () => {} }))
import { classifyAppliance } from '@zaviya/shared'
import { mergeAppliance, sensibleListPrice } from '@/lib/appliances/importer'
import { applianceIndexable, compareKey, comparePairs, findComparePair, similarAppliances, sortByPrice, categorySummaries, discountText, type ApplianceView } from '@/lib/appliances/logic'
import { toApplianceView } from '@/lib/appliances/queries'

const view = (slug: string, price: number | null, extra: Partial<ApplianceView> = {}): ApplianceView => ({
  id: slug,
  slug,
  name: slug,
  brand: { slug: 'anex', name: 'Anex', kind: 'store' },
  category: { slug: 'kettles', name: 'Electric Kettles', singular: 'Kettle', ur: 'کیتلی', group: 'appliances' },
  cityPrices: [],
  hotScore: 0,
  pricePkr: price,
  listPricePkr: null,
  inStock: true,
  officialUrl: `https://www.anex.pk/products/${slug}`,
  specs: [],
  priceHistory: [],
  popularity: 50,
  ...extra,
})

describe('appliance categories', () => {
  it('classifies by title and store type, most specific rule first', () => {
    expect(classifyAppliance('Electric Gas Water Heater DEG-15', 'Electric + Gas Water Heater (Big Tank)')).toBe('water-heaters')
    expect(classifyAppliance('Digital Inverter AC 11,260 BTU')).toBe('air-conditioners')
    expect(classifyAppliance('Water Cooler 35L', 'Water Cooler')).toBe('water-dispensers')
    expect(classifyAppliance('Room Air Cooler NAC-9800')).toBe('air-coolers')
    expect(classifyAppliance('AG-2186 Pressure Cooker', 'rice Cooker')).toBe('cookers')
    expect(classifyAppliance('AG-2111 Deluxe Air Fryer')).toBe('air-fryers')
    expect(classifyAppliance('Oil Filled Room Heater')).toBe('room-heaters')
    expect(classifyAppliance('AG-7043 Hair Straightener')).toBeNull()
    expect(classifyAppliance('AG-3091 Deluxe Insect Killer 2X8W')).toBeNull()
  })
})

describe('appliance importer', () => {
  const now = new Date('2026-11-05T06:00:00Z')
  const item = { brand: 'anex' as const, category: 'kettles' as const, name: 'AG-4057 Deluxe Kettle', officialUrl: 'https://www.anex.pk/products/ag-4057', pricePkr: 7900, listPricePkr: 9300 }

  it('creates with a price, a history row and a sensible was-price', () => {
    const r = mergeAppliance(null, item, now)
    expect(r.created).toBe(true)
    expect(r.data.slug).toBe('anex-ag-4057-deluxe-kettle')
    expect(r.data.pricePkr).toBe(7900)
    expect(r.data.listPricePkr).toBe(9300)
    expect(r.data.priceHistory).toHaveLength(1)
    expect(r.change).toEqual({ slug: 'anex-ag-4057-deluxe-kettle', name: 'AG-4057 Deluxe Kettle', from: null, to: 7900 })
  })

  it('is idempotent and keeps a known price when an item has none', () => {
    const first = mergeAppliance(null, item, now).data
    const again = mergeAppliance(first, item, now)
    expect(again.change).toBeNull()
    expect(again.data.priceHistory).toHaveLength(1)
    const noPrice = mergeAppliance(first, { ...item, pricePkr: null }, now)
    expect(noPrice.data.pricePkr).toBe(7900)
  })

  it('records a change and refuses a jump of more than 60%', () => {
    const first = mergeAppliance(null, item, now).data
    const cut = mergeAppliance(first, { ...item, pricePkr: 7500 }, now)
    expect(cut.change?.to).toBe(7500)
    expect(cut.data.priceHistory).toHaveLength(2)
    const glitch = mergeAppliance(cut.data, { ...item, pricePkr: 75 * 1000 }, now)
    expect(glitch.skipped).toEqual({ slug: 'anex-ag-4057-deluxe-kettle', from: 7500, to: 75000 })
    expect(glitch.data.pricePkr).toBe(7500)
  })

  it('ignores a was-price that is not higher or is more than 3x', () => {
    expect(sensibleListPrice(47500, 500000)).toBeNull()
    expect(sensibleListPrice(47500, 47500)).toBeNull()
    expect(sensibleListPrice(47500, 49000)).toBe(49000)
  })

  it('never overwrites an editor-set name or specs', () => {
    const first = { ...mergeAppliance(null, item, now).data, specs: [{ label: 'Capacity', value: '1.7 litres' }] }
    const r = mergeAppliance(first, { ...item, name: 'Other', specs: [{ label: 'Power', value: '1700 W' }] }, now)
    expect(r.data.name).toBe('AG-4057 Deluxe Kettle')
    expect(r.data.specs).toEqual([{ label: 'Capacity', value: '1.7 litres' }])
  })
})

describe('appliance pages logic', () => {
  const a = view('anex-a', 8000)
  const b = view('anex-b', 9000)
  const c = view('nasgas-c', 8500, { brand: { slug: 'nasgas', name: 'Nasgas', kind: 'store' } })
  const far = view('anex-far', 30000)
  const none = view('anex-none', null)
  const all = [a, b, c, far, none]

  it('indexes only priced products', () => {
    expect(applianceIndexable(a)).toBe(true)
    expect(applianceIndexable(none)).toBe(false)
  })

  it('sorts cheapest first, unpriced last', () => {
    expect(sortByPrice(all).map((x) => x.slug)).toEqual(['anex-a', 'nasgas-c', 'anex-b', 'anex-far', 'anex-none'])
  })

  it('finds similar products within 30% and prefers other brands', () => {
    const sim = similarAppliances(a, all)
    expect(sim.map((x) => x.slug)).toEqual(['nasgas-c', 'anex-b'])
  })

  it('compare keys are order-free and resolve back to both products', () => {
    expect(compareKey('b', 'a')).toBe('a-vs-b')
    const r = findComparePair('anex-b-vs-anex-a', all)
    expect(r?.key).toBe('anex-a-vs-anex-b')
    expect(findComparePair('anex-a-vs-nope', all)).toBeNull()
    const pairs = comparePairs(all)
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs.every((p) => p.a < p.b)).toBe(true)
  })

  it('summarises categories and discounts', () => {
    const s = categorySummaries(all)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ count: 5, priced: 4, minPrice: 8000, maxPrice: 30000 })
    expect(discountText({ pricePkr: 9000, listPricePkr: 10000 })).toBe("Rs 1,000 off the brand's earlier price (10%)")
    expect(discountText({ pricePkr: 9000, listPricePkr: null })).toBeNull()
  })

  it('maps a Payload doc and drops one without a store link', () => {
    expect(toApplianceView({ id: 1, slug: 's', name: 'n', brand: 'samsung', category: 'air-conditioners', officialUrl: 'https://www.samsung.com/pk/x/', pricePkr: '213999' })).toMatchObject({ pricePkr: 213999, brand: { name: 'Samsung' } })
    expect(toApplianceView({ id: 1, slug: 's', name: 'n', brand: 'samsung', category: 'air-conditioners' })).toBeNull()
  })
})

describe('appliance views render', () => {
  it('renders hub, list, product and compare pages with a Buy link to the brand store', async () => {
    const { createElement: h } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const V = await import('@/components/appliances/ApplianceViews')
    const { categoryFaqs, hubFaqs, productFaqs } = await import('@/lib/appliances/logic')
    const a = view('anex-a', 8000, { specs: [{ label: 'Capacity', value: '1.7 litres' }], listPricePkr: 9000, priceUpdatedAt: '2026-11-05T06:00:00Z', priceHistory: [{ date: '2026-11-05T06:00:00Z', pricePkr: 8000 }] })
    const b = view('nasgas-b', 8500, { brand: { slug: 'nasgas', name: 'Nasgas', kind: 'store' } })
    const all = [a, b]
    const summaries = categorySummaries(all)
    const hub = renderToStaticMarkup(h(V.ApplianceHubView, { summaries, movers: { up: [], down: [], windowDays: 14 }, baskets: [], trending: [a], faqs: hubFaqs(2), phones: { count: 66, minPrice: 20000, brands: ['Samsung'] } }))
    expect(hub).toContain('Prices in Pakistan today')
    expect(hub).toContain('href="/mobile-prices"')
    expect(hub).toContain('href="/petrol-price-today-pakistan"')
    expect(hub).toContain('href="/prices/kettles"')
    const list = renderToStaticMarkup(h(V.ApplianceListView, { title: 'Kettle prices', description: 'd', crumbs: [{ label: 'Home', href: '/' }], items: all, summaries, category: summaries[0]!.category, brands: [{ slug: 'anex', name: 'Anex', count: 1 }, { slug: 'nasgas', name: 'Nasgas', count: 1 }], faqs: categoryFaqs(summaries[0]!.category, all) }))
    expect(list).toContain('Rs 8,000')
    expect(list).toContain('href="/prices/kettles/nasgas"')
    const page = renderToStaticMarkup(h(V.AppliancePageView, { a, similar: [b], faqs: productFaqs(a) }))
    expect(page).toContain('href="https://www.anex.pk/products/anex-a"')
    expect(page).toContain('Buy from Anex official store')
    expect(page).toContain('href="/prices/compare/anex-a-vs-nasgas-b"')
    expect(page).toContain('"@type":"Offer"')
    const cmp = renderToStaticMarkup(h(V.ApplianceCompareView, { a, b }))
    expect(cmp).toContain('Capacity')
    expect(cmp).toContain('cheaper than')
  })
})

describe('appliance category fixes (5 Nov)', () => {
  it('an AC/DC hybrid air cooler is a cooler, not an AC', () => {
    expect(classifyAppliance('NasGas Eco-Hybrid NAC-2100 | AC/DC Dual Input Air Cooler | 40L Tank', 'Room Air Cooler')).toBe('air-coolers')
    expect(classifyAppliance('NasGas 85L Copper Room Air Cooler NAC-9700 AC')).toBe('air-coolers')
    expect(classifyAppliance('Wall Mount AC 12,000 BTU')).toBe('air-conditioners')
    expect(classifyAppliance('AG-3072 Deluxe Oven Toaster with Convection Fan')).toBe('toasters-sandwich-makers')
    expect(classifyAppliance('NasGas NG-553 Built-in Professional Baking Oven with Convection Fan')).toBe('microwave-ovens')
    expect(classifyAppliance('Deluxe Ultra Quiet Tower Fan WF-1546')).toBe('fans')
  })
  it('the importer moves a stored item to the corrected category', () => {
    const now = new Date('2026-11-05T06:00:00Z')
    const item = { brand: 'nasgas' as const, category: 'air-conditioners' as const, name: 'NAC-2100 Air Cooler', officialUrl: 'https://www.nasgas.com/products/nac-2100', pricePkr: 23500 }
    const stored = mergeAppliance(null, item, now).data
    expect(mergeAppliance(stored, { ...item, category: 'air-coolers' }, now).data.category).toBe('air-coolers')
  })
})
