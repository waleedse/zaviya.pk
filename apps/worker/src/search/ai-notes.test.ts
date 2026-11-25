import { describe, expect, it } from 'vitest'
import { cleanNote, notePrompt } from './ai-notes.js'
import { htmlText, imageList, parseShopify, parseWoo, specList } from './parsers.js'

describe('AI notes', () => {
  it('keeps plain prose and drops markup, thinking blocks and tiny replies', () => {
    expect(cleanNote('<think>hmm</think>**Telemart** has the best price today at Rs 65,399, and it is in stock. Alhamdtech lists it lower but is out of stock, so Telemart is the safer buy.')).toMatch(/^Telemart has the best price/)
    expect(cleanNote('ok')).toBeNull()
    expect(cleanNote('x'.repeat(900))).toBeNull()
  })
  it('puts only known facts into the prompt', () => {
    const p = notePrompt({ id: 'a', title: 'Apple AirPods Pro 3', brand: 'Apple', category: 'Wireless earbuds', offers: [{ store: 'Telemart', price: 65399, listPrice: 75000, inStock: true }], similar: [{ title: 'Galaxy Buds', price: 22999 }] })
    expect(p).toContain('Telemart: Rs 65,399')
    expect(p).toContain('Use ONLY the facts below')
    expect(p).toContain('Galaxy Buds')
  })
})

describe('listing pictures, text and specs', () => {
  it('turns store HTML into plain text', () => {
    expect(htmlText('<p>Great &amp; light</p><ul><li>ANC</li><li>USB-C</li></ul><script>x()</script>')).toBe('Great & light\nANC\nUSB-C')
  })
  it('keeps at most 6 distinct pictures and fixes protocol-less URLs', () => {
    expect(imageList(['//cdn.s.pk/a.jpg', 'https://cdn.s.pk/a.jpg', 'https://cdn.s.pk/b.jpg', 'ftp://x', ''])).toEqual(['https://cdn.s.pk/a.jpg', 'https://cdn.s.pk/b.jpg'])
  })
  it('cleans spec pairs', () => {
    expect(specList([['Colour', ' White '], ['Title', 'Default Title'], ['', 'x'], ['Size', '']])).toEqual({ Colour: 'White' })
  })
  it('reads Shopify images, description and options', () => {
    const [l] = parseShopify([{ title: 'AirPods Pro 3', handle: 'airpods-pro-3', vendor: 'Apple', body_html: '<p>Active noise cancelling</p>', images: [{ src: 'https://cdn.s.pk/1.jpg' }, { src: 'https://cdn.s.pk/2.jpg' }], options: [{ name: 'Colour', values: ['White'] }, { name: 'Title', values: ['Default Title'] }], variants: [{ price: '65399', available: true }] }], 'https://s.pk', 'Some Store')
    expect(l!.images).toHaveLength(2)
    expect(l!.description).toBe('Active noise cancelling')
    expect(l!.specs).toEqual({ Brand: 'Apple', Colour: 'White' })
  })
  it('reads WooCommerce attributes', () => {
    const [l] = parseWoo([{ name: 'Kettle', slug: 'kettle', permalink: 'https://s.pk/kettle', prices: { price: '3500', regular_price: '4000', currency_code: 'PKR', currency_minor_unit: 0 }, description: '<p>1.7 litre</p>', attributes: [{ name: 'Capacity', terms: [{ name: '1.7 L' }] }], images: [{ src: 'https://s.pk/k.jpg' }] }])
    expect(l!.specs).toEqual({ Capacity: '1.7 L' })
    expect(l!.description).toBe('1.7 litre')
  })
})
