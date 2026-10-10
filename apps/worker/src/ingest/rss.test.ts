import { describe, it, expect } from 'vitest'
import { normalizeRssItem, hashItem } from './rss.js'

describe('rss normalization', () => {
  it('normalizes items with hash', () => {
    const item = normalizeRssItem({
      guid: 'g1',
      link: 'https://example.com/a',
      title: 'Title',
      contentSnippet: 'Summary',
      isoDate: '2026-10-01T00:00:00.000Z',
    })
    expect(item?.externalId).toBe('g1')
    expect(item?.hash).toBe(hashItem('Title', 'https://example.com/a', 'Summary'))
  })

  it('returns null without link/title', () => {
    expect(normalizeRssItem({ title: 'x' })).toBeNull()
  })
})
