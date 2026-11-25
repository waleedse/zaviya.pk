import { describe, expect, it } from 'vitest'
import type { ProductOffer } from '@zaviya/shared'
import { buyingPick } from '@/lib/search/product-view'
import { clip, compareHref, discountPct, sortOffers } from '@/lib/search/product-pure'
import { buildDoc } from '@/lib/search/build-doc'

const offer = (o: Partial<ProductOffer> & { store_name: string; price: number }): ProductOffer => ({ store: o.store_name.toLowerCase(), list_price: null, in_stock: true, url: `https://${o.store_name}.pk/p`, image: null, updated_at: 1, ...o })

describe('product page logic', () => {
  const airpods = [
    offer({ store_name: 'Telemart', price: 65399, list_price: 75000 }),
    offer({ store_name: 'Airpods', price: 74999, list_price: 84999 }),
    offer({ store_name: 'Alhamdtech', price: 59990, list_price: 62000, in_stock: false }),
    offer({ store_name: 'Telex', price: 65399, list_price: 75000, in_stock: false }),
  ]
  it('puts in-stock offers first, cheapest first', () => {
    expect(sortOffers(airpods).map((o) => o.store_name)).toEqual(['Telemart', 'Airpods', 'Alhamdtech', 'Telex'])
  })
  it('sorts by biggest discount when asked', () => {
    expect(sortOffers(airpods, 'discount')[0]!.store_name).toBe('Telemart')
  })
  it('computes a real discount only against a higher list price', () => {
    expect(discountPct(airpods[0]!)).toBe(13)
    expect(discountPct(offer({ store_name: 'X', price: 100, list_price: 100 }))).toBe(0)
  })
  it('picks the cheapest in-stock store and mentions the cheaper store with no stock', () => {
    const pick = buyingPick({ offers: airpods })!
    expect(pick.best.store_name).toBe('Telemart')
    expect(pick.headline).toContain('Telemart')
    expect(pick.cheaperOutOfStock?.store_name).toBe('Alhamdtech')
    expect(pick.points.join(' ')).toContain('out of stock')
    expect(pick.points.join(' ')).toContain('13%')
  })
  it('does not recommend buying when nothing is in stock', () => {
    const pick = buyingPick({ offers: airpods.map((o) => ({ ...o, in_stock: false })) })!
    expect(pick.headline).toMatch(/out of stock/)
  })
  it('has no pick without offers', () => expect(buyingPick({ offers: [] })).toBeNull())
  it('gives one compare URL for both orders', () => {
    expect(compareHref('b-two', 'a-one')).toBe('/compare-products/a-one/b-two')
    expect(compareHref('a-one', 'b-two')).toBe('/compare-products/a-one/b-two')
  })
  it('clips text on a word boundary', () => {
    expect(clip('one two three four five', 14)).toBe('one two three…')
    expect(clip('short', 14)).toBe('short')
  })
})

describe('buildDoc carries pictures, text and specs', () => {
  const row = (store: string, extra: Record<string, unknown>) => ({ slug: `${store}-a`, store, title: 'Apple AirPods Pro 3', brand: 'Apple', model: null, group: 'earbuds', cat: 'Electronics > Audio > Earbuds & headphones > Wireless earbuds', url: `https://${store}.pk/a`, image_url: `https://${store}.pk/1.jpg`, price_pkr: 65000, list_price_pkr: 75000, in_stock: true, seen_at: new Date(), ...extra })
  it('merges distinct pictures with their store and the longest description', () => {
    const d = buildDoc('k', [row('telemart', { images: ['https://telemart.pk/1.jpg', 'https://telemart.pk/2.jpg'], description: 'short', specs: { Colour: 'White' } }), row('airpods', { description: 'a much longer description of the product', specs: { Colour: 'Black', Warranty: '1 year' } })], (x) => x.toUpperCase())!
    expect(d.images!.map((i) => i.url)).toEqual(['https://telemart.pk/1.jpg', 'https://telemart.pk/2.jpg', 'https://airpods.pk/1.jpg'])
    expect(d.images![0]!.store).toBe('TELEMART')
    expect(d.description).toBe('a much longer description of the product')
    expect(d.specs).toEqual({ Colour: 'White', Warranty: '1 year' })
    expect(d.category_path).toEqual(['Electronics', 'Electronics > Audio', 'Electronics > Audio > Earbuds & headphones', 'Electronics > Audio > Earbuds & headphones > Wireless earbuds'])
  })
})
