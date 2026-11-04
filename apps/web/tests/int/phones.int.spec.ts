import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PhoneImportBodySchema, phoneSlug } from '@zaviya/shared'
import { MAX_JUMP, mergePhone, type StoredPhone } from '../../src/lib/phones/importer'
import { MIN_INDEXABLE_LIST, NOT_ANNOUNCED, compareVerdict, findPair, parseBandSlug, phoneFaqs, phoneJsonLd, phonesUnder, popularPairs, priceText, recentPriceChanges, relatedPhones } from '../../src/lib/phones/logic'
import { toPhoneView } from '../../src/lib/phones/queries'
import type { BrandView, PhoneView } from '../../src/lib/phones/types'
import { ComparePageView, PhoneListView, PhonePageView } from '../../src/components/phones/PhoneViews'

const NOW = new Date('2026-11-04T06:00:00Z')
const item = (over: Record<string, unknown> = {}) =>
  PhoneImportBodySchema.shape.phones.element.parse({
    brand: 'samsung',
    name: 'Galaxy A17 5G',
    specs: { batteryMah: 5000, chipset: 'Exynos 1330' },
    variants: [{ storageGb: 256, pricePkr: 99999, priceSourceUrl: 'https://www.samsung.com/pk/x/' }],
    ...over,
  })

describe('phone importer', () => {
  it('slugs: brand prefix unless the name already has it', () => {
    expect(phoneSlug('samsung', 'Galaxy A17 5G')).toBe('samsung-galaxy-a17-5g')
    expect(phoneSlug('realme', 'realme Note 60x')).toBe('realme-note-60x')
  })

  it('creates a phone with its first price in the history', () => {
    const r = mergePhone(null, item(), { brandId: 1, mode: 'seed', now: NOW })
    expect(r.created).toBe(true)
    expect(r.data.slug).toBe('samsung-galaxy-a17-5g')
    expect(r.data.pricePkr).toBe(99999)
    expect(r.data.priceHistory).toEqual([{ date: NOW.toISOString(), variant: '256GB', pricePkr: 99999, sourceUrl: 'https://www.samsung.com/pk/x/' }])
    expect(r.changes).toHaveLength(1)
  })

  it('is idempotent: the same prices again change nothing and add no history', () => {
    const first = mergePhone(null, item(), { brandId: 1, mode: 'prices', now: NOW })
    const again = mergePhone(first.data, item(), { brandId: 1, mode: 'prices', now: new Date('2026-11-05T06:00:00Z') })
    expect(again.changes).toEqual([])
    expect(again.data.priceHistory).toHaveLength(1)
    expect(again.created).toBe(false)
  })

  it('records a price change with date, variant and source', () => {
    const first = mergePhone(null, item(), { brandId: 1, mode: 'prices', now: NOW })
    const later = new Date('2026-11-10T06:00:00Z')
    const r = mergePhone(first.data, item({ variants: [{ storageGb: 256, pricePkr: 94999, priceSourceUrl: 'https://www.samsung.com/pk/y/' }] }), { brandId: 1, mode: 'prices', now: later })
    expect(r.changes).toEqual([{ slug: 'samsung-galaxy-a17-5g', name: 'Galaxy A17 5G', variant: '256GB', from: 99999, to: 94999 }])
    expect(r.data.pricePkr).toBe(94999)
    expect(r.data.priceHistory!.at(-1)).toMatchObject({ pricePkr: 94999, sourceUrl: 'https://www.samsung.com/pk/y/' })
  })

  it('never wipes a known price when the source shows none, and never invents one', () => {
    const first = mergePhone(null, item(), { brandId: 1, mode: 'prices', now: NOW })
    const r = mergePhone(first.data, item({ variants: [{ storageGb: 256 }] }), { brandId: 1, mode: 'prices', now: NOW })
    expect(r.data.pricePkr).toBe(99999)
    const none = mergePhone(null, item({ variants: [] }), { brandId: 1, mode: 'seed', now: NOW })
    expect(none.data.pricePkr).toBeNull()
    expect(none.data.priceHistory).toEqual([])
  })

  it('refuses a suspicious jump instead of writing it', () => {
    const first = mergePhone(null, item(), { brandId: 1, mode: 'prices', now: NOW })
    const crazy = Math.round(99999 * (1 + MAX_JUMP + 0.2))
    const r = mergePhone(first.data, item({ variants: [{ storageGb: 256, pricePkr: crazy }] }), { brandId: 1, mode: 'prices', now: NOW })
    expect(r.skipped).toHaveLength(1)
    expect(r.data.pricePkr).toBe(99999)
    expect(r.changes).toEqual([])
  })

  it('only fills empty fields: admin edits survive a re-import', () => {
    const edited: StoredPhone = { ...mergePhone(null, item(), { brandId: 1, mode: 'seed', now: NOW }).data, specs: { batteryMah: 5100, chipset: '' }, popularity: 90 }
    const r = mergePhone(edited, item(), { brandId: 1, mode: 'seed', now: NOW })
    expect(r.data.specs).toMatchObject({ batteryMah: 5100, chipset: 'Exynos 1330' })
    expect(r.data.popularity).toBe(90)
  })

  it('rejects a price that is not a positive whole number', () => {
    expect(PhoneImportBodySchema.safeParse({ phones: [{ brand: 'samsung', name: 'X1', variants: [{ storageGb: 64, pricePkr: -5 }] }] }).success).toBe(false)
    expect(PhoneImportBodySchema.safeParse({ phones: [{ brand: 'nokia', name: 'X1' }] }).success).toBe(false)
  })
})

const brand = (slug: string, name: string): BrandView => ({ id: slug, slug, name, order: 1 })
const brands = new Map([['samsung', brand('samsung', 'Samsung')], ['vivo', brand('vivo', 'Vivo')]])
const doc = (slug: string, name: string, b: string, price: number | null, extra: Record<string, unknown> = {}) => ({
  id: slug,
  slug,
  name,
  brand: b,
  status: 'current',
  popularity: 50,
  imageUrl: 'https://img.test/p.png',
  variants: price ? [{ ramGb: 8, storageGb: 256, pricePkr: price, priceSourceUrl: 'https://www.samsung.com/pk/x/' }] : [{ storageGb: 128 }],
  specs: { batteryMah: 5000, chipset: 'Exynos 1330', displaySize: '6.7 inches' },
  ...extra,
})
const view = (...args: Parameters<typeof doc>) => toPhoneView(doc(...args), brands)!

describe('phone logic', () => {
  const a = view('samsung-a17', 'Galaxy A17 5G', 'samsung', 99999, { priceUpdatedAt: '2026-11-04T06:00:00Z' })
  const b = view('vivo-y32', 'Y32', 'vivo', 82999, { specs: { batteryMah: 8000 } })
  const c = view('samsung-a07', 'Galaxy A07', 'samsung', null)

  it('shows "price not announced" for a phone without a price, never a number', () => {
    expect(c.pricePkr).toBeNull()
    expect(priceText(c.pricePkr)).toBe(NOT_ANNOUNCED)
    expect(phoneFaqs(c)[0]!.a).toMatch(/has not announced an official Pakistan price/)
    const ld = phoneJsonLd(c, 'https://zaviya.pk/mobile/samsung-a07') as Record<string, unknown>
    expect(ld.offers).toBeUndefined()
  })

  it('derives the price from the variants, not from a stored field', () => {
    expect(toPhoneView(doc('s', 'S', 'samsung', null, { pricePkr: 12345 }), brands)!.pricePkr).toBeNull()
  })

  it('builds Product + Offer with PKR', () => {
    const ld = phoneJsonLd(a, 'https://zaviya.pk/mobile/samsung-a17') as Record<string, any>
    expect(ld['@type']).toBe('Product')
    expect(ld.offers).toMatchObject({ '@type': 'Offer', priceCurrency: 'PKR', price: '99999' })
  })

  it('under-X lists only phones with an official price at or under the band', () => {
    expect(parseBandSlug('under-30000')).toBe(30000)
    expect(parseBandSlug('under-31000')).toBeNull()
    expect(phonesUnder([a, b, c], 90000).map((p) => p.slug)).toEqual(['vivo-y32'])
    expect(MIN_INDEXABLE_LIST).toBeGreaterThan(1)
  })

  it('compare pairs are deterministic, canonical-ordered and findable', () => {
    const pairs = popularPairs([a, b, c])
    expect(pairs.length).toBeGreaterThan(0)
    for (const p of pairs) expect(p.a < p.b).toBe(true)
    expect(findPair(pairs, pairs[0]!.key)).toBe(pairs[0])
    expect(findPair(pairs, 'x-vs-y')).toBeNull()
    expect(popularPairs([a, b, c])).toEqual(pairs)
  })

  it('compare verdict states only what both phones have', () => {
    const v = compareVerdict(a, b)
    expect(v[0]).toMatch(/Vivo Y32 is cheaper/)
    expect(v.join(' ')).toMatch(/larger battery/)
    expect(compareVerdict(a, c)[0]).toMatch(/No official Pakistan price/)
  })

  it('recent price changes ignore a phone first record', () => {
    const p = { ...a, priceHistory: [{ date: '2026-11-03T00:00:00Z', variant: '256GB', pricePkr: 99999 }] }
    expect(recentPriceChanges([p], NOW)).toEqual([])
    const q = { ...a, priceHistory: [{ date: '2026-11-03T00:00:00Z', variant: '256GB', pricePkr: 94999 }, { date: '2026-10-01T00:00:00Z', variant: '256GB', pricePkr: 99999 }] }
    expect(recentPriceChanges([q], NOW)[0]).toMatchObject({ from: 99999, to: 94999 })
  })

  it('related phones exclude the phone itself', () => {
    expect(relatedPhones(a, [a, b, c]).map((p) => p.slug)).not.toContain('samsung-a17')
  })
})

describe('page rendering', () => {
  const a = view('samsung-a17', 'Galaxy A17 5G', 'samsung', 99999, {
    priceUpdatedAt: '2026-11-04T06:00:00Z',
    priceHistory: [{ date: '2026-11-04T06:00:00Z', variant: '8GB + 256GB', pricePkr: 99999, sourceUrl: 'https://www.samsung.com/pk/x/' }],
    colours: [{ name: 'Black' }],
  })
  const c = view('samsung-a07', 'Galaxy A07', 'samsung', null)

  it('phone page: price per variant, specs, FAQ, last updated, price history, schema', () => {
    const html = renderToStaticMarkup(h(PhonePageView, { phone: a, related: [c], pairs: [{ key: 'samsung-a07-vs-samsung-a17', label: 'A07 vs A17' }], brandPhones: 2 }))
    expect(html).toContain('Rs 99,999')
    expect(html).toContain('8GB + 256GB')
    expect(html).toContain('Exynos 1330')
    expect(html).toContain('Last updated')
    expect(html).toContain('price history')
    expect(html).toContain('Questions readers ask')
    expect(html).toContain('"@type":"Product"')
    expect(html).toContain('"@type":"BreadcrumbList"')
    expect(html).toContain('"@type":"FAQPage"')
    expect(html).toContain('/compare/samsung-a07-vs-samsung-a17')
  })

  it('phone page without a price says so and has no Offer', () => {
    const html = renderToStaticMarkup(h(PhonePageView, { phone: c, related: [], pairs: [] }))
    expect(html).toContain(NOT_ANNOUNCED)
    expect(html).not.toMatch(/Rs \d/)
    expect(html).not.toContain('"@type":"Offer"')
  })

  it('list page: cards link to phones; an empty list shows the empty text', () => {
    const full = renderToStaticMarkup(h(PhoneListView, { title: 'T', description: 'D', crumbs: [{ label: 'Home', href: '/' }, { label: 'Mobile prices', url: '/mobile-prices' }], phones: [a, c], brands: [brand('samsung', 'Samsung')] }))
    expect(full).toContain('href="/mobile/samsung-a17"')
    expect(full).toContain('From Rs 99,999')
    expect(full).toContain(NOT_ANNOUNCED)
    expect(full).toContain('/mobile-prices/under-30000')
    const empty = renderToStaticMarkup(h(PhoneListView, { title: 'T', description: 'D', crumbs: [{ label: 'Home', href: '/' }], phones: [], brands: [], emptyText: 'Nothing yet' }))
    expect(empty).toContain('Nothing yet')
  })

  it('compare page: both phones, differences, table, FAQ', () => {
    const b = view('vivo-y32', 'Y32', 'vivo', 82999, { specs: { batteryMah: 8000 } })
    const html = renderToStaticMarkup(h(ComparePageView, { a, b, pair: { key: 'samsung-a17-vs-vivo-y32', a: a.slug, b: b.slug } }))
    expect(html).toContain('Samsung Galaxy A17 5G vs Vivo Y32')
    expect(html).toContain('Specifications compared')
    expect(html).toContain('Rs 82,999')
    expect(html).toContain('"@type":"FAQPage"')
  })
})
