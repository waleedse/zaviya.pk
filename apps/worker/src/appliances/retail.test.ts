import { describe, expect, it } from 'vitest'
import { RETAIL_STORES, matchPhone, offerGroup } from '@zaviya/shared'
import { nextCursor, parseRetailProducts, runRetailTick } from './retail.js'

const phones = [
  { slug: 'samsung-galaxy-s25', brand: 'Samsung', name: 'Galaxy S25' },
  { slug: 'samsung-galaxy-s25-ultra', brand: 'Samsung', name: 'Galaxy S25 Ultra' },
  { slug: 'xiaomi-redmi-note-14', brand: 'Xiaomi', name: 'Redmi Note 14' },
  { slug: 'apple-iphone-16', brand: 'Apple', name: 'iPhone 16' },
]

describe('store offers', () => {
  it('sorts listings into our groups', () => {
    expect(offerGroup('Redmi 17 5G (Pre Booking)', 'Phone')).toBe('mobiles')
    expect(offerGroup('Xiaomi Smart Band 11', 'Eco')).toBe('smartwatches')
    expect(offerGroup('Samsung Galaxy A56 8GB 256GB', '')).toBe('mobiles')
    expect(offerGroup('USB to Lightning Charging Cable 1M', 'Physical Product')).toBe('accessories')
    expect(offerGroup('Redmi Pad 2 8GB 256GB', '')).toBe('tablets')
    expect(offerGroup('DELONGHI DINAMICA PLUS AUTOMATIC COFFEE MACHINE', 'COFFEE MACHINE')).toBe('other')
    expect(offerGroup('Anex Air Fryer AG-2020', '')).toBe('home-appliances')
  })

  it('matches a listing to the right phone, never the Ultra for a plain S25 or the reverse', () => {
    expect(matchPhone({ title: 'Samsung Galaxy S25 12GB 256GB PTA Approved Icy Blue', brand: 'Samsung' }, phones)).toBe('samsung-galaxy-s25')
    expect(matchPhone({ title: 'Samsung Galaxy S25 Ultra 12/512GB Titanium Black', brand: 'Samsung' }, phones)).toBe('samsung-galaxy-s25-ultra')
    expect(matchPhone({ title: 'Samsung Galaxy S25+ 12GB 256GB', brand: 'Samsung' }, phones)).toBeNull()
    expect(matchPhone({ title: 'Redmi Note 14 Pro 8GB 256GB', brand: 'Xiaomi' }, phones)).toBeNull()
    expect(matchPhone({ title: 'Redmi Note 14 6GB 128GB Midnight Black', brand: 'Xiaomi' }, phones)).toBe('xiaomi-redmi-note-14')
    expect(matchPhone({ title: 'iPhone 16 128GB Black (Non PTA)' }, phones)).toBe('apple-iphone-16')
    expect(matchPhone({ title: 'iPhone 16 Pro Max 256GB' }, phones)).toBeNull()
  })

  it('reads a Shopify page into offers with the store image and link, skipping unpriced listings', () => {
    const store = RETAIL_STORES.find((s) => s.slug === 'mistore')!
    const items = parseRetailProducts(
      [
        { title: 'Redmi 17 5G', handle: 'redmi-17-5g', vendor: 'Xiaomi', product_type: 'Phone', images: [{ src: '//cdn.shopify.com/a.jpg' }], variants: [{ price: '74999.00', available: false }, { price: '72999.00', compare_at_price: '79999.00', available: true }] },
        { title: 'Gift card', handle: 'gift', variants: [{ price: '0.00' }] },
      ],
      store,
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ store: 'mistore', pricePkr: 72999, listPricePkr: 79999, inStock: true, group: 'mobiles', brand: 'Xiaomi', url: 'https://mistore.pk/products/redmi-17-5g', imageUrl: 'https://cdn.shopify.com/a.jpg' })
  })

  it('moves page by page, then to the next store, and wraps around', () => {
    expect(nextCursor({ store: 0, page: 1 }, 250, 3)).toEqual({ store: 0, page: 2 })
    expect(nextCursor({ store: 0, page: 4 }, 17, 3)).toEqual({ store: 1, page: 1 })
    expect(nextCursor({ store: 2, page: 1 }, 0, 3)).toEqual({ store: 0, page: 1 })
  })

  it('one tick reads one page, posts it and saves the cursor', async () => {
    const kv = new Map<string, string>()
    const posted: unknown[] = []
    const out = await runRetailTick({
      kv: { get: async (k) => kv.get(k) ?? null, set: async (k, v) => kv.set(k, v) },
      request: async <T,>(_m: string, _p: string, b?: unknown) => {
        posted.push(b)
        return { matched: 1, changed: 0 } as T
      },
      fetchText: async () => JSON.stringify({ products: [{ title: 'Redmi Note 14 6GB 128GB', handle: 'rn14', vendor: 'Xiaomi', variants: [{ price: '45999' }] }] }),
    })
    expect(out.offers).toBe(1)
    expect(posted).toHaveLength(1)
    expect(JSON.parse(kv.get('zaviya:retail:cursor')!)).toEqual({ store: 1, page: 1 })
  })
})
