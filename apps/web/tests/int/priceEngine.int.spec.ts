import { describe, expect, it } from 'vitest'
import { classifyAppliance } from '@zaviya/shared'
import { mergeAppliance } from '@/lib/appliances/importer'
import { hotScores, matchSearch, words, type DemandItem } from '@/lib/appliances/demand'
import { categoryBySlug, categoryFaqs, fullName, productFaqs, sitemapItems, trendingItems, type ApplianceView } from '@/lib/appliances/logic'
import { categoryCopy } from '@/lib/appliances/seo-copy'

const now = new Date('2026-11-06T06:00:00Z')

const view = (slug: string, price: number | null, extra: Partial<ApplianceView> = {}): ApplianceView => ({
  id: slug,
  slug,
  name: slug,
  brand: { slug: 'honda', name: 'Honda', kind: 'store' },
  category: { slug: 'motorcycles', name: 'Motorcycles & Electric Bikes', singular: 'Motorcycle', ur: 'موٹر سائیکل', group: 'vehicles' },
  cityPrices: [],
  hotScore: 0,
  pricePkr: price,
  listPricePkr: null,
  inStock: true,
  officialUrl: `https://www.atlashonda.com.pk/product/${slug}/`,
  specs: [],
  priceHistory: [],
  popularity: 50,
  ...extra,
})

const atta = view('atta-20kg-price', 2900, {
  name: 'Atta (Wheat Flour) 20 kg Bag',
  nameUr: 'آٹا 20 کلو تھیلا',
  unit: '20 kg bag',
  brand: { slug: 'pbs', name: 'Pakistan Bureau of Statistics', kind: 'source' },
  category: { slug: 'atta-rice', name: 'Atta, Rice & Bread', singular: 'Staple', ur: 'آٹا اور چاول', group: 'groceries' },
  officialUrl: 'https://www.pbs.gov.pk/weekly-sensitive-price-indicator-spi-for-the-week-ended-on-29-10-2026/',
  cityPrices: [
    { city: 'Lahore', min: 2800, avg: 2950, max: 3100 },
    { city: 'Karachi', min: 3000, avg: 3200, max: 3400 },
    { city: 'Islamabad', min: 3240, avg: 3278.77, max: 3333.33 },
    { city: 'Multan', min: 2600, avg: 2700, max: 2800 },
  ],
})

describe('price engine: categories', () => {
  it('keeps GFC "AC DC" fans out of air conditioners', () => {
    expect(classifyAppliance('Atlas AC/DC', 'Ceiling Fans')).toBe('fans')
    expect(classifyAppliance('Paragon Inverter', 'AC DC Ceiling Fan')).toBe('fans')
    expect(classifyAppliance('GFH - 20 Fan Heater')).toBe('room-heaters')
    expect(classifyAppliance('Digital Inverter AC 11,260 BTU')).toBe('air-conditioners')
    expect(classifyAppliance('GFC - Iconic - LFP BATTERY')).toBeNull()
    expect(classifyAppliance('Wall Dimmer for AC/DC & Inverter Fans')).toBeNull()
  })
})

describe('price engine: importer', () => {
  it('applies official statistics even when the price jumps, and replaces city prices', () => {
    const existing = { name: 'Tomatoes 1 kg', slug: 'tomato-price', brand: 'pbs', category: 'vegetables-fruits', officialUrl: 'https://www.pbs.gov.pk/a/', pricePkr: 100, priceHistory: [], cityPrices: [{ city: 'Lahore', avg: 100 }] }
    const r = mergeAppliance(existing, { brand: 'pbs', category: 'vegetables-fruits', name: 'Tomatoes 1 kg', slug: 'tomato-price', officialUrl: 'https://www.pbs.gov.pk/b/', pricePkr: 250, trusted: true, unit: '1 kg', cityPrices: [{ city: 'Lahore', avg: 240 }, { city: 'Karachi', avg: 260 }] }, now)
    expect(r.skipped).toBeNull()
    expect(r.data.pricePkr).toBe(250)
    expect(r.data.cityPrices).toHaveLength(2)
    expect(r.data.unit).toBe('1 kg')
    expect(r.data.officialUrl).toBe('https://www.pbs.gov.pk/b/')
  })
  it('still guards brand stores against a glitchy jump', () => {
    const existing = { name: 'CD 70', slug: 'honda-cd-70', brand: 'honda', category: 'motorcycles', officialUrl: 'https://x.pk/a/', pricePkr: 159_900, priceHistory: [] }
    const r = mergeAppliance(existing, { brand: 'honda', category: 'motorcycles', name: 'CD 70', officialUrl: 'https://x.pk/a/', pricePkr: 15_990 }, now)
    expect(r.skipped).not.toBeNull()
    expect(r.data.pricePkr).toBe(159_900)
  })
})

describe('price engine: demand and hot items', () => {
  const items: DemandItem[] = [
    { slug: 'honda-cd-70', name: 'CD 70', brandName: 'Honda', categoryName: 'Motorcycles & Electric Bikes', categorySlug: 'motorcycles' },
    { slug: 'honda-cd-70-dream', name: 'CD 70 Dream', brandName: 'Honda', categoryName: 'Motorcycles & Electric Bikes', categorySlug: 'motorcycles' },
    { slug: 'honda-cg-125', name: 'CG 125', brandName: 'Honda', categoryName: 'Motorcycles & Electric Bikes', categorySlug: 'motorcycles' },
    { slug: 'atta-20kg-price', name: 'Atta (Wheat Flour) 20 kg Bag', brandName: 'Pakistan Bureau of Statistics', categoryName: 'Atta, Rice & Bread', categorySlug: 'atta-rice' },
    { slug: 'sugar-price', name: 'Sugar 1 kg', brandName: 'Pakistan Bureau of Statistics', categoryName: 'Sugar, Tea, Salt & Spices', categorySlug: 'sugar-tea-spices' },
  ]
  it('splits model numbers and drops price words, years and cities', () => {
    expect(words('Honda CD70 price in Pakistan 2026')).toEqual(['honda', 'cd', '70'])
    expect(words('atta 20kg price lahore today')).toEqual(['atta', '20', 'kg'])
  })
  it('matches a search to every item that answers it, with Urdu-English synonyms', () => {
    expect(matchSearch('honda cd 70 price', items).map((i) => i.slug)).toEqual(['honda-cd-70', 'honda-cd-70-dream'])
    expect(matchSearch('aata 20 kg', items).map((i) => i.slug)).toEqual(['atta-20kg-price'])
    expect(matchSearch('flour 20 kg price lahore', items).map((i) => i.slug)).toEqual(['atta-20kg-price'])
    expect(matchSearch('cheeni rate today', items).map((i) => i.slug)).toEqual(['sugar-price'])
    expect(matchSearch('price in pakistan', items)).toEqual([])
    // the category name ("Atta, Rice & Bread") does not make rice an answer to "atta price"
    const rice = { slug: 'basmati-rice-price', name: 'Basmati Rice (Broken) 1 kg', brandName: 'Pakistan Bureau of Statistics', categoryName: 'Atta, Rice & Bread', categorySlug: 'atta-rice' }
    expect(matchSearch('atta price today', [...items, rice]).map((i) => i.slug)).toEqual(['atta-20kg-price'])
    // a kind-of-product word matches the category: "honda bike price" finds every Honda motorcycle
    expect(matchSearch('honda bike price', items)).toHaveLength(3)
    const fan = { slug: 'gfc-atlas-ac-dc', name: 'Atlas AC/DC', brandName: 'GFC', categoryName: 'Fans', categorySlug: 'fans' }
    const geyser = { slug: 'gfc-gf-606in', name: 'GF-606IN Instant Geysers (LPG & Natural)', brandName: 'GFC', categoryName: 'Geysers & Water Heaters', categorySlug: 'water-heaters' }
    const lpg = { slug: 'lpg-cylinder-price', name: 'LPG Cylinder 11.67 kg', brandName: 'Pakistan Bureau of Statistics', categoryName: 'LPG, Firewood & Soap', categorySlug: 'lpg-fuel-household' }
    expect(matchSearch('ac dc fan price', [fan, geyser]).map((i) => i.slug)).toEqual(['gfc-atlas-ac-dc'])
    expect(matchSearch('gas cylinder price', [fan, geyser, lpg]).map((i) => i.slug)).toEqual(['lpg-cylinder-price'])
  })
  it('scores visitors and the strongest search', () => {
    const { scores, matches } = hotScores(items, new Map([['honda-cg-125', 3]]), [
      { query: 'cd 70 price', priority: 90 },
      { query: 'honda bike price', priority: 40 },
    ])
    expect(scores.get('honda-cd-70')).toBe(90)
    expect(scores.get('honda-cg-125')).toBe(30 + 40)
    expect(matches.get('honda bike price')).toHaveLength(3)
  })
})

describe('price engine: pages', () => {
  it('names statistics items without a brand and brand items with one', () => {
    expect(fullName(atta)).toBe('Atta (Wheat Flour) 20 kg Bag')
    expect(fullName(view('honda-cd-70', 159_900, { name: 'CD 70' }))).toBe('Honda CD 70')
  })
  it('writes grocery FAQs from the city prices', () => {
    const faqs = productFaqs(atta)
    expect(faqs[0]!.a).toContain('Rs 2,900')
    expect(faqs.find((f) => f.q.includes('cheapest'))!.a).toContain('Multan')
    expect(faqs.find((f) => f.q.includes('Lahore'))!.a).toContain('Rs 2,950')
    expect(categoryFaqs(categoryBySlug('atta-rice')!, [atta]).some((f) => f.a.includes('Pakistan Bureau of Statistics'))).toBe(true)
  })
  it('puts keywords and the month in category titles', () => {
    const bikes = [view('honda-cd-70', 159_900, { name: 'CD 70', hotScore: 50 }), view('honda-cg-125', 238_500, { name: 'CG 125' })]
    const copy = categoryCopy(categoryBySlug('motorcycles')!, bikes, 'November 2026')
    expect(copy.metaTitle).toContain('November 2026')
    expect(copy.metaTitle).toContain('CD 70')
    expect(copy.metaDescription).toContain('bike price in Pakistan')
    expect(categoryCopy(categoryBySlug('atta-rice')!, [atta], 'November 2026').metaTitle).toContain('Lahore, Karachi, Islamabad')
  })
  it('ranks trending items by hot score and skips unpriced ones', () => {
    const t = trendingItems([view('a', 1000, { hotScore: 5 }), view('b', 1000, { hotScore: 50 }), view('c', null, { hotScore: 99 }), view('d', 1000)])
    expect(t.map((x) => x.slug)).toEqual(['b', 'a'])
  })
  it('lists groceries and vehicles, then the most searched appliances, in the sitemap; never unpriced ones', () => {
    const fan = (slug: string, hot: number, price: number | null = 9000) =>
      view(slug, price, { hotScore: hot, category: { slug: 'fans', name: 'Fans', singular: 'Fan', ur: 'پنکھا', group: 'appliances' } })
    const items = sitemapItems([fan('fan-cold', 0), fan('fan-hot', 40), fan('fan-unpriced', 99, null), atta, view('honda-cd-70', 159_900)], 3)
    expect(items.map((x) => x.slug)).toEqual(['atta-20kg-price', 'honda-cd-70', 'fan-hot'])
  })
  it('renders a grocery page with the city table, the PBS source and no Buy button or Product offer', async () => {
    const { createElement: h } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const V = await import('@/components/appliances/ApplianceViews')
    const html = renderToStaticMarkup(h(V.AppliancePageView, { a: atta, similar: [], faqs: productFaqs(atta) }))
    expect(html).toContain('price today in Pakistan')
    expect(html).toContain('Multan')
    expect(html).toContain('Source: PBS weekly price release')
    expect(html).not.toContain('Buy from')
    expect(html).not.toContain('"@type":"Product"')
  })
  it('renders a car page with the maker price list link', async () => {
    const { createElement: h } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const V = await import('@/components/appliances/ApplianceViews')
    const car = view('toyota-yaris-gli-1-3-mt', 4_649_000, {
      name: 'Yaris GLI 1.3 MT',
      unit: 'Ex-factory price',
      brand: { slug: 'toyota', name: 'Toyota', kind: 'maker' },
      category: { slug: 'cars', name: 'Cars', singular: 'Car', ur: 'گاڑی', group: 'vehicles' },
      officialUrl: 'https://toyota-indus.com/',
    })
    const html = renderToStaticMarkup(h(V.AppliancePageView, { a: car, similar: [], faqs: productFaqs(car) }))
    expect(html).toContain('Toyota Yaris GLI 1.3 MT price in Pakistan')
    expect(html).toContain('Ex-factory price')
    expect(html).toContain('Official price list on Toyota Pakistan')
  })
})
