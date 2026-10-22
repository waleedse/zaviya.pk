import { createHash } from 'node:crypto'
import Parser from 'rss-parser'
import type { SourceItemInput } from '../payload-client.js'
import { ZAVIYA_USER_AGENT } from './extract.js'

const parser = new Parser({
  customFields: { item: ['content:encoded', 'content'] },
})

export interface NormalizedRssItem {
  externalId: string
  url: string
  title: string
  summary?: string
  publishedAt: string
  lang: string
  hash: string
}

export function hashItem(title: string, url: string, summary?: string): string {
  return createHash('sha1').update(`${title}|${url}|${summary ?? ''}`).digest('hex')
}

export function normalizeRssItem(
  item: { guid?: string; link?: string; title?: string; contentSnippet?: string; isoDate?: string; pubDate?: string },
  defaultLang = 'en',
): NormalizedRssItem | null {
  const url = item.link?.trim()
  const title = item.title?.trim()
  if (!url || !title) return null
  const externalId = (item.guid ?? url).toString()
  const summary = item.contentSnippet?.trim()
  const publishedAt = item.isoDate ?? item.pubDate ?? new Date().toISOString()
  return {
    externalId,
    url,
    title,
    summary,
    publishedAt: new Date(publishedAt).toISOString(),
    lang: defaultLang,
    hash: hashItem(title, url, summary),
  }
}

export async function fetchRssFeed(
  url: string,
  opts?: { etag?: string | null; lastModified?: string | null; fetchFn?: typeof fetch },
): Promise<{
  items: NormalizedRssItem[]
  etag?: string
  lastModified?: string
  notModified: boolean
}> {
  const fetchFn = opts?.fetchFn ?? fetch
  const headers: Record<string, string> = { 'User-Agent': ZAVIYA_USER_AGENT }
  if (opts?.etag) headers['If-None-Match'] = opts.etag
  if (opts?.lastModified) headers['If-Modified-Since'] = opts.lastModified

  const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(25_000) })
  if (res.status === 304) return { items: [], notModified: true }
  if (!res.ok) throw new Error(`RSS fetch failed ${res.status}`)
  const xml = await res.text()
  const feed = await parser.parseString(xml)
  const items = (feed.items ?? [])
    .map((i) => normalizeRssItem(i))
    .filter((x): x is NormalizedRssItem => x !== null)
  return {
    items,
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
    notModified: false,
  }
}

/**
 * Feeds older than this are not news any more. Google News search feeds ("petrol price Pakistan") return
 * matches going back a year; on 16 Oct those joined today's clusters (a KP story clustered with an April
 * petrol hike), the editor rejected the pitches and QA failed the drafts as unsupported.
 */
export const MAX_ITEM_AGE_MS = 48 * 60 * 60_000

export function toSourceItemInputs(sourceId: string, items: NormalizedRssItem[], lang?: string, now = Date.now()): SourceItemInput[] {
  return items.filter((i) => !(now - Date.parse(i.publishedAt) > MAX_ITEM_AGE_MS)).map((i) => ({
    sourceId,
    externalId: i.externalId,
    url: i.url,
    title: i.title,
    summary: i.summary,
    publishedAt: i.publishedAt,
    lang: lang ?? i.lang,
    hash: i.hash,
  }))
}

const JOB_TITLE = /\b(ppsc|fpsc|nts|jobs?|vacanc\w*|recruitment|hiring|posts?|apply|last date|advertisement)\b/i

/** Titles of job-like feed items that toSourceItemInputs left out (too old), so the drop is logged and not silent (ZAV-86). */
export function jobLikeDropped(all: NormalizedRssItem[], kept: SourceItemInput[]): string[] {
  const keptIds = new Set(kept.map((k) => k.externalId))
  return all.filter((i) => !keptIds.has(i.externalId) && JOB_TITLE.test(i.title)).map((i) => i.title)
}
