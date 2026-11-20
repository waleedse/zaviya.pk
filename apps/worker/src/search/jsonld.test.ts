import { describe, expect, it } from 'vitest'
import { parseProductHtml } from './jsonld.js'

const page = (ld: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`

describe('parseProductHtml', () => {
  it('reads a JSON-LD product with a PKR offer', () => {
    const l = parseProductHtml(page({ '@context': 'https://schema.org', '@type': 'Product', name: 'Oud Perfume 100ml', image: ['https://s.pk/a.jpg'], brand: { '@type': 'Brand', name: 'Fana' }, offers: { '@type': 'Offer', price: '2,500', priceCurrency: 'PKR', availability: 'https://schema.org/InStock' } }), 'https://s.pk/product/oud')
    expect(l).toMatchObject({ title: 'Oud Perfume 100ml', brand: 'Fana', pricePkr: 2500, inStock: true, handle: 'product-oud' })
  })
  it('finds the product inside @graph', () => {
    const l = parseProductHtml(page({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'Product', name: 'Spoon Set', offers: [{ price: 499, priceCurrency: 'PKR', availability: 'OutOfStock' }] }] }), 'https://s.pk/p/spoon')
    expect(l).toMatchObject({ pricePkr: 499, inStock: false })
  })
  it('ignores other currencies', () => {
    expect(parseProductHtml(page({ '@type': 'Product', name: 'Mug', offers: { price: 12, priceCurrency: 'USD' } }), 'https://s.com/product/mug')).toBeNull()
  })
  it('falls back to product meta tags', () => {
    const html = '<meta property="og:title" content="Tea 950g"><meta property="product:price:amount" content="1450"><meta property="product:price:currency" content="PKR">'
    expect(parseProductHtml(html, 'https://s.pk/product/tea')).toMatchObject({ title: 'Tea 950g', pricePkr: 1450 })
  })
})
