import { describe, expect, it } from 'vitest'
import { hasPublishingRoom } from './instagram.js'

describe('hasPublishingRoom', () => {
  it('uses the quota_total Instagram returns (100), not 50', () => {
    expect(hasPublishingRoom({ data: [{ quota_usage: 51, config: { quota_total: 100 } }] })).toBe(true)
    expect(hasPublishingRoom({ data: [{ quota_usage: 100, config: { quota_total: 100 } }] })).toBe(false)
  })
  it('falls back to 100 when config is missing', () => {
    expect(hasPublishingRoom({ data: [{ quota_usage: 51 }] })).toBe(true)
    expect(hasPublishingRoom({ data: [{ quota_usage: 100 }] })).toBe(false)
  })
  it('allows posting when the response is empty', () => {
    expect(hasPublishingRoom({})).toBe(true)
  })
})
