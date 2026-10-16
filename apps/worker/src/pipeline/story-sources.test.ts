import { describe, it, expect } from 'vitest'
import { selectStorySources } from './story-sources.js'

const item = (n: number, tier: number, at = '2026-10-12T00:00:00Z') => ({
  url: `https://x.test/${n}`,
  publishedAt: at,
  source: { trustTier: tier },
})

describe('selectStorySources', () => {
  it('caps a huge cluster and prefers the best tier', () => {
    const items = Array.from({ length: 200 }, (_, i) => item(i, i === 150 ? 1 : 3))
    const out = selectStorySources(items)
    expect(out).toHaveLength(8)
    expect(out[0]!.url).toBe('https://x.test/150')
  })

  it('drops duplicate URLs', () => {
    expect(selectStorySources([item(1, 1), item(1, 1), item(2, 2)])).toHaveLength(2)
  })
})
