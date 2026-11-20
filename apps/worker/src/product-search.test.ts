import { describe, expect, it } from 'vitest'
import { docId, productKey, searchSynonyms } from '@zaviya/shared'

describe('product search', () => {
  it('merges the same model across stores', () => {
    const a = productKey({ slug: 'telemart-x', brand: 'Samsung', model: 'SM-A546E' })
    const b = productKey({ slug: 'mistore-y', brand: 'samsung', model: 'sm-a546e' })
    expect(a).toBe(b)
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
