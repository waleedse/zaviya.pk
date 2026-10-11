import { parseHTML } from 'linkedom'
import { hashItem } from './rss.js'
import { ZAVIYA_USER_AGENT } from './extract.js'
import type { SourceItemInput } from '../payload-client.js'

export interface TrendNewsItem {
  title: string
  url: string
  source?: string
}

export interface Trend {
  query: string
  traffic: number
  trafficLabel: string
  publishedAt: string
  news: TrendNewsItem[]
}

export const TRENDS_URL_HOST = 'trends.google.com'

export function isTrendsUrl(url: string): boolean {
  try {
    return new URL(url).hostname === TRENDS_URL_HOST
  } catch {
    return false
  }
}

/** "20K+" -> 20000, "500+" -> 500 */
export function parseTraffic(label: string): number {
  const m = /([\d.,]+)\s*([KkMm])?/.exec(label)
  if (!m) return 0
  const n = Number(m[1]!.replace(/,/g, ''))
  const mult = m[2]?.toLowerCase() === 'm' ? 1_000_000 : m[2]?.toLowerCase() === 'k' ? 1000 : 1
  return Math.round(n * mult)
}

export function parseTrendsRss(xml: string): Trend[] {
  // linkedom lowercases and keeps namespaced tag names, so match them literally.
  const { document } = parseHTML(xml.replace(/<(\/?)ht:/g, '<$1ht-'))
  const out: Trend[] = []
  for (const item of Array.from(document.querySelectorAll('item'))) {
    const query = item.querySelector('title')?.textContent?.trim()
    if (!query) continue
    const trafficLabel = item.querySelector('ht-approx_traffic')?.textContent?.trim() ?? ''
    const pub = item.querySelector('pubDate')?.textContent?.trim()
    const news: TrendNewsItem[] = []
    for (const n of Array.from(item.querySelectorAll('ht-news_item'))) {
      const title = n.querySelector('ht-news_item_title')?.textContent?.trim()
      const url = n.querySelector('ht-news_item_url')?.textContent?.trim()
      if (title && url) news.push({ title, url, source: n.querySelector('ht-news_item_source')?.textContent?.trim() })
    }
    out.push({
      query,
      traffic: parseTraffic(trafficLabel),
      trafficLabel,
      publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      news,
    })
  }
  return out
}

export async function fetchTrends(url = 'https://trends.google.com/trending/rss?geo=PK'): Promise<Trend[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': ZAVIYA_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Trends fetch failed ${res.status}`)
  return parseTrendsRss(await res.text())
}

/** Each trend's linked coverage becomes a source item, so trending topics enter the normal cluster/triage flow. */
export function trendsToSourceItems(sourceId: string, trends: Trend[]): SourceItemInput[] {
  const items: SourceItemInput[] = []
  for (const t of trends) {
    for (const n of t.news.slice(0, 3)) {
      const summary = `Trending in Pakistan: "${t.query}" (${t.trafficLabel} searches)${n.source ? ` · ${n.source}` : ''}`
      items.push({
        sourceId,
        externalId: n.url,
        url: n.url,
        title: n.title,
        summary,
        publishedAt: t.publishedAt,
        lang: 'en',
        hash: hashItem(n.title, n.url, summary),
      })
    }
  }
  return items
}
