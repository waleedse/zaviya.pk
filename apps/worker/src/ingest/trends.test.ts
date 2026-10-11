import { describe, it, expect } from 'vitest'
import { parseTrendsRss, parseTraffic, trendsToSourceItems, isTrendsUrl } from './trends.js'

const XML = `<?xml version="1.0"?><rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0"><channel>
<item><title>petrol price</title><ht:approx_traffic>20K+</ht:approx_traffic><pubDate>Sat, 10 Oct 2026 15:20:00 -0700</pubDate>
<ht:news_item><ht:news_item_title>Petrol cut by Rs5</ht:news_item_title><ht:news_item_url>https://example.pk/a</ht:news_item_url><ht:news_item_source>Dawn</ht:news_item_source></ht:news_item>
</item></channel></rss>`

describe('trends', () => {
  it('parses traffic labels', () => {
    expect(parseTraffic('20K+')).toBe(20000)
    expect(parseTraffic('500+')).toBe(500)
    expect(parseTraffic('1M+')).toBe(1_000_000)
  })
  it('parses the RSS and maps news to source items', () => {
    const trends = parseTrendsRss(XML)
    expect(trends).toHaveLength(1)
    expect(trends[0]).toMatchObject({ query: 'petrol price', traffic: 20000 })
    expect(trends[0]!.news[0]).toEqual({ title: 'Petrol cut by Rs5', url: 'https://example.pk/a', source: 'Dawn' })
    const items = trendsToSourceItems('9', trends)
    expect(items[0]).toMatchObject({ sourceId: '9', url: 'https://example.pk/a', externalId: 'https://example.pk/a' })
    expect(items[0]!.summary).toContain('petrol price')
  })
  it('detects trends URLs', () => {
    expect(isTrendsUrl('https://trends.google.com/trending/rss?geo=PK')).toBe(true)
    expect(isTrendsUrl('https://dawn.com/feed')).toBe(false)
  })
})
