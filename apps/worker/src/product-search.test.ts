import { describe, expect, it } from 'vitest'
import { docId, productKey, searchSynonyms } from '@zaviya/shared'

describe('product search', () => {
  it('merges the same model across stores', () => {
    const a = productKey({ slug: 'telemart-x', brand: 'Samsung', model: 'SM-A546E' })
    const b = productKey({ slug: 'mistore-y', brand: 'samsung', model: 'sm-a546e' })
    expect(a).toBe(b)
  })
  it('merges the same title at two stores, in any word order', () => {
    const a = productKey({ slug: 'a', title: 'I-143-You Perfume for Women - Citrus, Floral & Tropical - 50ml' })
    const b = productKey({ slug: 'b', title: '50ml Tropical Citrus Floral I 143 You Perfume Women (Official Warranty)' })
    expect(a).toBe(b)
    expect(productKey({ slug: 'c', title: 'I-143-You Perfume for Women - Citrus, Floral & Tropical - 100ml' })).not.toBe(a)
  })
  it('keeps listings without a model separate', () => {
    expect(productKey({ slug: 'a-spoon' })).not.toBe(productKey({ slug: 'b-spoon' }))
  })
  it('uses the GTIN when there is one', () => {
    expect(productKey({ slug: 'x', gtin: '6901234567892', model: 'AB-123' })).toBe('gtin-6901234567892')
  })
  it('makes ids Meilisearch accepts and synonyms both ways', () => {
    expect(docId('m-x-a/b c')).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(searchSynonyms()['chasma']).toContain('glasses')
    expect(searchSynonyms()['glasses']).toContain('chasma')
  })
})
