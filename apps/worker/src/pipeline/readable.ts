import Parser from 'rss-parser'
import { parseHTML } from 'linkedom'
import type { PayloadClient } from '../payload-client.js'
import { fetchArticleText, ZAVIYA_USER_AGENT } from '../ingest/extract.js'
import { isAllowedByRobots } from '../ingest/robots.js'
import { logger } from '../logger.js'

/**
 * ZAV-301: a story whose only sources are Google News links (Dawn, ARY, "Google News - Pakistan") has no readable body:
 * the link is a JavaScript redirect. 305 clusters in three days, many of them the trending ones (Iran-US, US midterms),
 * were rejected "headline only". Before such a cluster is closed, text is looked for in two honest places:
 *   1. the outlet's own RSS feed (Dawn publishes the full article in it; ARY gives the page link, which is fetched);
 *   2. another outlet's readable report of the same story from the last 24 h (BBC, Geo, The Nation, APP...), copied
 *      into the cluster as one more source, so the article cites it.
 * Nothing is written from a headline: QA still checks every fact against the text found here.
 */

const MIN_TEXT = 300
/** Enough real reporting for the writer to work from (same bar as ingest) */
export const READABLE_PEER_MIN_CHARS = 500

type ThinItem = { id?: string; title: string; summary?: string; contentText?: string; url: string; publishedAt?: string; source?: { name: string; trustTier: number } }

export interface PublisherFeed {
  /** Outlet name as it appears after the dash in a Google News headline, or in the Google News source name */
  outlet: RegExp
  feeds: string[]
}

export const PUBLISHER_FEEDS: PublisherFeed[] = [
  {
    outlet: /^dawn(\.com)?$/i,
    feeds: ['https://www.dawn.com/feeds/latest-news', 'https://www.dawn.com/feeds/home', 'https://www.dawn.com/feeds/world', 'https://www.dawn.com/feeds/pakistan', 'https://www.dawn.com/feeds/business', 'https://www.dawn.com/feeds/sport'],
  },
  { outlet: /^ary ?news(\.tv)?$|^arynews(\.tv)?$/i, feeds: ['https://arynews.tv/feed'] },
]

export interface FeedEntry {
  title: string
  link: string
  /** Plain text of the item body when the feed carries one */
  body: string
}

const parser = new Parser({ customFields: { item: ['content:encoded'] } })

/** Plain paragraphs of an HTML fragment; embeds, figures and scripts are dropped. */
export function htmlToText(html: string): string {
  const { document } = parseHTML(`<div id="r">${html}</div>`)
  const root = document.getElementById('r')
  if (!root) return ''
  for (const el of Array.from(root.querySelectorAll('figure, blockquote, script, style, iframe, aside'))) el.remove()
  const paras = Array.from(root.querySelectorAll('p')).map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  const text = paras.length ? paras.join('\n\n') : (root.textContent ?? '').replace(/\s+/g, ' ').trim()
  return text
}

export async function parseFeedEntries(xml: string): Promise<FeedEntry[]> {
  const feed = await parser.parseString(xml)
  return (feed.items ?? [])
    .map((i) => {
      const raw = (i as unknown as Record<string, unknown>)['content:encoded'] ?? i.content ?? ''
      return { title: (i.title ?? '').trim(), link: (i.link ?? '').trim(), body: htmlToText(String(raw)) }
    })
    .filter((e) => e.title && e.link)
}

const FEED_TTL_MS = 5 * 60_000
const feedCache = new Map<string, { at: number; entries: FeedEntry[] }>()
/** Tests only */
export function clearFeedCache(): void {
  feedCache.clear()
}

async function loadFeed(url: string, fetchFn: typeof fetch): Promise<FeedEntry[]> {
  const hit = feedCache.get(url)
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.entries
  const res = await fetchFn(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`feed ${url} ${res.status}`)
  const entries = await parseFeedEntries(await res.text())
  feedCache.set(url, { at: Date.now(), entries })
  return entries
}

/** "Iran shoots down US MQ-9 drone - Dawn" -> { headline, outlet: "Dawn" } */
export function splitOutlet(title: string): { headline: string; outlet: string } {
  const m = /^(.*\S)\s+[-–|]\s+([^-–|]{2,40})$/.exec(title.trim())
  return m ? { headline: m[1]!, outlet: m[2]!.trim() } : { headline: title.trim(), outlet: '' }
}

function normTitle(s: string): string {
  return s.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').replace(/\s+/g, ' ').trim()
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'has', 'have', 'its', 'into', 'over', 'after', 'amid', 'says', 'said', 'will', 'are', 'was', 'were', 'his', 'her', 'their', 'than', 'but', 'not', 'new', 'how', 'why', 'what', 'who', 'about'])
/** Topic words that two different stories on the same day share; they do not show it is the same story. */
const GENERIC = new Set(['iran', 'iranian', 'trump', 'pakistan', 'pakistani', 'talks', 'deal', 'war', 'strike', 'strikes', 'israel', 'israeli', 'saudi', 'china', 'india', 'election', 'elections', 'midterm', 'midterms', 'minister', 'government', 'president', 'court', 'police', 'killed', 'news'])

function tokens(title: string): Set<string> {
  const out = new Set<string>()
  for (const w of normTitle(title).split(' ')) {
    if (w.length < 3 || STOP.has(w)) continue
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)
  }
  return out
}

/**
 * True when two headlines from different outlets are about the same event: enough shared words relative to the shorter
 * headline, and at least two of them specific (not "Iran" or "Trump", which a dozen stories a day share).
 */
export function sameStoryHeadlines(a: string, b: string): boolean {
  const A = tokens(splitOutlet(a).headline)
  const B = tokens(splitOutlet(b).headline)
  if (A.size < 3 || B.size < 3) return false
  const shared = [...A].filter((t) => B.has(t))
  const specific = shared.filter((t) => !GENERIC.has(t))
  return shared.length >= 3 && specific.length >= 2 && shared.length / Math.min(A.size, B.size) >= 0.55
}

function findEntry(headline: string, entries: FeedEntry[]): FeedEntry | undefined {
  const want = normTitle(headline)
  const exact = entries.find((e) => normTitle(e.title) === want)
  if (exact) return exact
  const A = tokens(headline)
  return entries.find((e) => {
    const B = tokens(e.title)
    if (A.size < 3 || B.size < 3) return false
    const inter = [...A].filter((t) => B.has(t)).length
    return inter / (A.size + B.size - inter) >= 0.85
  })
}

export interface RecoverDeps {
  payload: Pick<PayloadClient, 'patchSourceItem' | 'readableItems' | 'attachItem'>
  fetchFn?: typeof fetch
  fetchText?: (url: string) => Promise<string | null>
  allowed?: (url: string) => Promise<boolean>
  now?: () => number
}

const hasBody = (it: { title: string; summary?: string; contentText?: string }) => {
  const text = `${it.summary ?? ''} ${it.contentText ?? ''}`.replace(/\s+/g, ' ').trim()
  return text.length > it.title.length + 40 && text.length >= MIN_TEXT
}

/** Body of one headline-only item from its outlet's own RSS feed (plus the page it links to when the feed has no body). */
export async function readFromPublisherFeed(item: ThinItem, deps: RecoverDeps): Promise<{ text: string; host: string } | null> {
  const fetchFn = deps.fetchFn ?? fetch
  const { headline, outlet } = splitOutlet(item.title)
  const sourceOutlet = (item.source?.name ?? '').replace(/\s*\(via Google News\)\s*$/i, '').trim()
  const cfg = PUBLISHER_FEEDS.find((f) => (outlet && f.outlet.test(outlet)) || (sourceOutlet && f.outlet.test(sourceOutlet)))
  if (!cfg) return null
  for (const url of cfg.feeds) {
    let entries: FeedEntry[]
    try {
      entries = await loadFeed(url, fetchFn)
    } catch (e) {
      logger.debug({ url, err: e instanceof Error ? e.message : e }, 'publisher feed unavailable')
      continue
    }
    const entry = findEntry(headline, entries)
    if (!entry) continue
    const host = new URL(entry.link).hostname.replace(/^www\./, '')
    if (entry.body.length >= MIN_TEXT) return { text: entry.body, host }
    const allowed = deps.allowed ?? ((u: string) => isAllowedByRobots(u).catch(() => false))
    if (!(await allowed(entry.link))) return null
    const text = await (deps.fetchText ?? ((u: string) => fetchArticleText(u)))(entry.link)
    return text && text.length >= MIN_TEXT ? { text, host } : null
  }
  return null
}

/**
 * Try to give a headline-only cluster readable text. True when anything was saved or attached; the caller reads the
 * cluster again. Never throws: each step logs and falls through.
 */
export async function recoverReadableText(
  cluster: { id: string; headline?: string; items: ThinItem[] },
  deps: RecoverDeps,
): Promise<boolean> {
  let saved = false
  const thin = cluster.items.filter((it) => it.id && !hasBody(it)).slice(0, 3)
  for (const it of thin) {
    try {
      const got = await readFromPublisherFeed(it, deps)
      if (!got) continue
      await deps.payload.patchSourceItem(it.id!, { contentText: `${got.text.slice(0, 6000)}\n\n(Read from ${got.host} through the outlet's RSS feed)` })
      saved = true
      logger.info({ clusterId: cluster.id, itemId: it.id, host: got.host, chars: got.text.length }, 'headline-only: text read from the outlet feed')
    } catch (e) {
      logger.warn({ clusterId: cluster.id, itemId: it.id, err: e instanceof Error ? e.message : e }, 'headline-only: outlet feed read failed')
    }
  }
  if (saved || cluster.items.some(hasBody)) return saved

  // Another outlet's readable report of the same story
  try {
    const headlines = [cluster.headline, ...cluster.items.map((i) => i.title)].filter((t): t is string => Boolean(t))
    const { items: peers } = await deps.payload.readableItems(24)
    const own = new Set(cluster.items.map((i) => i.id))
    const picked: typeof peers = []
    const seenSources = new Set<string>()
    for (const p of peers) {
      if (own.has(p.id) || p.clusterId === cluster.id || seenSources.has(p.source.id)) continue
      if (!headlines.some((h) => sameStoryHeadlines(h, p.title))) continue
      picked.push(p)
      seenSources.add(p.source.id)
      if (picked.length >= 2) break
    }
    for (const p of picked) {
      await deps.payload.attachItem(cluster.id, p.id)
      saved = true
      logger.info({ clusterId: cluster.id, peerItemId: p.id, outlet: p.source.name, title: p.title }, 'headline-only: attached another outlet\'s readable report of the same story')
    }
  } catch (e) {
    logger.warn({ clusterId: cluster.id, err: e instanceof Error ? e.message : e }, 'headline-only: peer search failed')
  }
  return saved
}

/** Trending: several outlets, a Google Trends PK hit, or a major world story. Such a cluster is retried, not binned, while it is fresh. */
export function isTrendingCluster(cluster: { distinctSources?: number; items: { source?: { name: string } }[] }, globalTopic: string | null): boolean {
  return (
    Boolean(globalTopic) ||
    Number(cluster.distinctSources ?? 0) >= 3 ||
    cluster.items.some((i) => /^google trends/i.test(i.source?.name ?? ''))
  )
}
