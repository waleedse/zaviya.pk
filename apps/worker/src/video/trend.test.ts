import { describe, expect, it } from 'vitest'
import { parseSlots } from './schedule.js'
import { pickTrendArticle, trendMatches, trendNames, TREND_SLOT_SPEC } from './trend.js'
import type { ApiArticle } from './lib.js'

const NOW = Date.UTC(2026, 9, 21, 7, 55)
const art = (id: number, title: string, hoursAgo: number, image = true): ApiArticle => ({
  id,
  title,
  dek: null,
  slug: `s-${id}`,
  category: { slug: 'pakistan' },
  heroImage: image ? { url: `https://zaviya.pk/${id}.jpg` } : null,
  publishedAt: new Date(NOW - hoursAgo * 3600_000).toISOString(),
})

describe('pickTrendArticle (ZAV-150)', () => {
  const articles = [
    art(1, 'Petrol price cut by Rs5 per litre from midnight', 5),
    art(2, 'Babar Azam century lifts Pakistan against England', 2),
    art(3, 'Old petrol story', 20),
  ]
  it('takes the strongest trend that has a fresh article', () => {
    expect(pickTrendArticle(articles, ['Taylor Swift', 'babar azam', 'petrol price'], NOW)).toEqual({ id: 2, trend: 'babar azam' })
  })
  it('prefers the newest article inside one trend', () => {
    expect(pickTrendArticle([...articles, art(4, 'Petrol price: what changes for drivers', 1)], ['petrol price'], NOW)).toEqual({ id: 4, trend: 'petrol price' })
  })
  it('skips with a reason when nothing matches, nothing is fresh or the article has no photo', () => {
    expect(pickTrendArticle(articles, ['Taylor Swift'], NOW)).toMatchObject({ skip: expect.stringContaining('matches') })
    expect(pickTrendArticle([art(3, 'Old petrol story', 20)], ['petrol'], NOW)).toMatchObject({ skip: expect.stringContaining('12 h') })
    expect(pickTrendArticle([art(5, 'Petrol price cut', 1, false)], ['petrol'], NOW)).toMatchObject({ skip: expect.stringContaining('photo') })
    expect(pickTrendArticle(articles, [], NOW)).toEqual({ skip: 'no trends available' })
  })
  it('does not reuse an article a trend Reel already covered', () => {
    expect(pickTrendArticle(articles, ['petrol price'], NOW, new Set([1]))).toMatchObject({ skip: expect.any(String) })
  })
  it('needs every significant word, and ignores short one-word trends', () => {
    expect(trendMatches('petrol strike', articles[0]!)).toBe(false)
    expect(trendMatches('ai', art(9, 'AI rules in Pakistan', 1))).toBe(false)
  })
})

describe('trend helpers', () => {
  it('reads trend names from a snapshot, tolerating bad data', () => {
    expect(trendNames(JSON.stringify({ trends: ['a b', { title: 'c d' }, { name: 'e f' }] }))).toEqual(['a b', 'c d', 'e f'])
    expect(trendNames('not json')).toEqual([])
    expect(trendNames(null)).toEqual([])
  })
  it('the trend slot parses as a daily trend25 slot at 12:55', () => {
    expect(parseSlots(TREND_SLOT_SPEC)[0]).toMatchObject({ name: 'trend', hour: 12, minute: 55, format: 'trend25', days: '*' })
  })
})
