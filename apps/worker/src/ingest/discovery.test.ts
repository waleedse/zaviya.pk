import { describe, it, expect, vi } from 'vitest'
import { detectLang, xPostsToItems, instagramPostsToItems, runDiscovery } from './discovery.js'
import { embedsFromUrls } from '../pipeline/publish.js'

const post = (id: string, text: string) => ({ id, author: 'StateBank_Pak', text, url: '', createdAt: '2026-10-10T10:00:00Z', mediaUrls: [] })

describe('discovery', () => {
  it('detects Urdu vs English', () => {
    expect(detectLang('پاکستان میں پیٹرول کی قیمت کم ہو گئی')).toBe('ur')
    expect(detectLang('Petrol price cut by Rs5 in Pakistan')).toBe('en')
  })

  it('maps X posts to source items and drops short posts', () => {
    const items = xPostsToItems('7', [post('1', 'SBP keeps policy rate unchanged at 11% for the third meeting in a row'), post('2', 'ok')])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ sourceId: '7', externalId: 'x:1', url: 'https://x.com/StateBank_Pak/status/1', lang: 'en' })
  })

  it('maps Instagram captions', () => {
    const items = instagramPostsToItems('8', [{ shortcode: 'Cabc', url: 'https://www.instagram.com/p/Cabc/', caption: 'Heavy rain expected in Karachi over the next 48 hours, PMD says', username: 'geonews.tv' }])
    expect(items[0]).toMatchObject({ externalId: 'ig:Cabc', summary: '@geonews.tv on Instagram' })
  })

  it('does nothing when the extension is offline', async () => {
    const send = vi.fn()
    const res = await runDiscovery({ bridge: { isOnline: () => false, send }, xSourceId: '1' })
    expect(res.items).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  it('collects trends and search results through the bridge', async () => {
    const send = vi.fn(async (job: { type: string }) => {
      if (job.type === 'x.trending') return { trends: [{ name: '#PetrolPrice' }] }
      return { posts: [post('5', 'Government announces Rs10 cut in petrol price from midnight tonight')] }
    })
    const res = await runDiscovery({ bridge: { isOnline: () => true, send }, xSourceId: '1', xQueries: ['q1'], pauseMs: [0, 0] })
    expect(res.xTrends[0]!.name).toBe('#PetrolPrice')
    expect(send).toHaveBeenCalledTimes(3)
    expect(res.items.length).toBe(2)
  })
})

describe('embedsFromUrls', () => {
  it('extracts X and Instagram embeds, deduped', () => {
    expect(
      embedsFromUrls([
        'https://x.com/StateBank_Pak/status/123',
        'https://twitter.com/foo/status/123',
        'https://www.instagram.com/reel/Cxyz/',
        'https://dawn.com/news/1',
      ]),
    ).toEqual([
      { type: 'x', url: 'https://x.com/i/web/status/123' },
      { type: 'instagram', url: 'https://www.instagram.com/reel/Cxyz/' },
    ])
  })
})

import { publisherName } from '../pipeline/publish.js'
describe('publisherName', () => {
  it('uses the outlet from Google News titles', () => {
    expect(publisherName('Unemployment hits 21-year high - Arab News PK', 'Google News — Pakistan jobs & results')).toBe('Arab News PK')
    expect(publisherName('Some story', 'Dawn')).toBe('Dawn')
    expect(publisherName('No outlet suffix', 'Google News — Pakistan')).toBe('Google News')
    // ZAV-143: a Trends item without a suffix is credited to the outlet in its URL
    expect(publisherName('Munir in Tehran', 'Google Trends — Pakistan daily', 'https://www.arabnews.pk/node/123')).toBe('Arab News PK')
    expect(publisherName('Munir in Tehran', 'Google Trends — Pakistan daily', 'https://news.google.com/rss/articles/x')).toBe('Google Trends')
    expect(publisherName('Munir in Tehran', 'Google Trends — Pakistan daily')).toBe('Google Trends')
  })
})
