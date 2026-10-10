import { describe, it, expect } from 'vitest'
import { socialIdempotencyKey } from './idempotency.js'

describe('socialIdempotencyKey', () => {
  it('is stable sha1', () => {
    const a = socialIdempotencyKey('art1', 'x', 'link')
    const b = socialIdempotencyKey('art1', 'x', 'link')
    expect(a).toBe(b)
    expect(a).toHaveLength(40)
  })
})
