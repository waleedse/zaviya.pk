import { describe, it, expect } from 'vitest'
import { normalizeRssItem, hashItem, toSourceItemInputs, MAX_ITEM_AGE_MS } from './rss.js'

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

  it('drops items older than two days (search feeds return year-old matches)', () => {
    const now = Date.parse('2026-10-16T00:00:00Z')
    const mk = (title: string, iso: string) => normalizeRssItem({ guid: title, link: `https://example.com/${title}`, title, isoDate: iso })!
    const out = toSourceItemInputs('1', [mk('fresh', '2026-10-15T20:00:00Z'), mk('edge', new Date(now - MAX_ITEM_AGE_MS + 60_000).toISOString()), mk('old', '2026-04-03T09:00:00Z')], 'en', now)
    expect(out.map((i) => i.title)).toEqual(['fresh', 'edge'])
  })
})
