import { describe, expect, it } from 'vitest'
import { collectAppliances, modelFrom, parseShopifyProducts, samsungApplianceUrls, specsFrom } from './collect.js'
import { makeCtx } from '../phones/catalog.js'

describe('shopify appliance feed', () => {
  const products = [
    { title: 'AG-2111 Deluxe Air Fryer', handle: 'ag-2111', product_type: 'Air Fryer', body_html: '<p>Capacity: 5.5 Litre</p><p>Power: 1700W</p><p>2 Years Warranty</p>', images: [{ src: '//cdn.shopify.com/a.jpg' }], variants: [{ price: '43300.00', compare_at_price: '50900.00', available: true }] },
    { title: 'AG-7043 Hair Straightener', handle: 'ag-7043', variants: [{ price: '8200.00' }] },
    { title: 'Electric Gas Water Heater DEG-15', handle: 'deg-15', product_type: 'Electric + Gas Water Heater (Big Tank)', body_html: '15 Gallons, 1 kg copper <span style="width:100%;">x</span>', variants: [{ price: '47500.00', compare_at_price: '500000.00', available: false }, { price: '49000.00' }] },
    { title: 'No handle kettle', variants: [{ price: '5000' }] },
  ]
  it('keeps appliances, drops beauty items and items without a URL', () => {
    const out = parseShopifyProducts(products, 'anex', 'https://www.anex.pk')
    expect(out.map((o) => o.category)).toEqual(['air-fryers', 'water-heaters'])
    expect(out[0]).toMatchObject({ brand: 'anex', pricePkr: 43300, listPricePkr: 50900, inStock: true, imageUrl: 'https://cdn.shopify.com/a.jpg', officialUrl: 'https://www.anex.pk/products/ag-2111', model: 'AG-2111' })
    expect(out[1]).toMatchObject({ pricePkr: 47500, inStock: true })
  })
  it('reads only sensible size facts for the category', () => {
    const geyser = specsFrom('Electric Gas Water Heater DEG-15 15 Gallons, 1 kg copper construction', 'water-heaters')
    expect(geyser).toContainEqual({ label: 'Capacity', value: '15 gallons' })
    expect(geyser.find((s) => s.label === 'Washing capacity')).toBeUndefined()
    const ac = specsFrom('Digital Inverter AC 11,260 BTU with heating support', 'air-conditioners')
    expect(ac).toEqual([
      { label: 'Cooling (BTU)', value: '11,260 BTU' },
      { label: 'Inverter', value: 'Yes' },
      { label: 'Heating', value: 'Yes' },
    ])
    const junk = specsFrom('x\nwidth: 100%;\nDescription: something\nWater Tank Capacity: 180ml\n', 'irons')
    expect(junk).toEqual([{ label: 'Water Tank Capacity', value: '180ml' }])
  })
  it('finds model codes', () => {
    expect(modelFrom('AG-2111 Deluxe Air Fryer')).toBe('AG-2111')
    expect(modelFrom('Deluxe Kettle WF-3118')).toBe('WF-3118')
    expect(modelFrom('Plain kettle')).toBeUndefined()
  })
})

describe('samsung appliances', () => {
  it('keeps product pages of the categories we list, with the model code', () => {
    const xml = [
      'https://www.samsung.com/pk/air-conditioners/',
      'https://www.samsung.com/pk/air-conditioners/all-air-conditioners/',
      'https://www.samsung.com/pk/air-conditioners/wall-mount/ar9500t-ar50f12c1uhnsa-non-windfree-ar50f12c1nh2pm/',
      'https://www.samsung.com/pk/washers-and-dryers/top-loader/wa80ck4240bwrt/',
      'https://www.samsung.com/pk/home-appliances/vacuum/vs20/',
    ].map((u) => `<loc>${u}</loc>`).join('')
    expect(samsungApplianceUrls(xml)).toEqual([
      { url: 'https://www.samsung.com/pk/air-conditioners/wall-mount/ar9500t-ar50f12c1uhnsa-non-windfree-ar50f12c1nh2pm/', category: 'air-conditioners', model: 'AR50F12C1NH2PM' },
      { url: 'https://www.samsung.com/pk/washers-and-dryers/top-loader/wa80ck4240bwrt/', category: 'washing-machines', model: 'WA80CK4240BWRT' },
    ])
  })
})

describe('collect', () => {
  it('a failing store never blocks the others, and duplicates are dropped', async () => {
    const feed = JSON.stringify({ products: [{ title: 'Deluxe Kettle WF-3118', handle: 'wf-3118', variants: [{ price: '4320.00' }] }, { title: 'Deluxe Kettle WF-3118', handle: 'wf-3118-b', variants: [{ price: '4320.00' }] }] })
    const ctx = makeCtx({ fetchText: async (url) => (url.startsWith('https://www.westpoint.pk/products.json') ? feed : null) })
    const r = await collectAppliances(ctx)
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ brand: 'westpoint', category: 'kettles', slug: 'westpoint-deluxe-kettle-wf-3118' })
    expect(r.failed.map((f) => f.brand).sort()).toEqual(['anex', 'nasgas', 'samsung'])
  })
})
