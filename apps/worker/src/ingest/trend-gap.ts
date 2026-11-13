import { createHash } from 'node:crypto'
import Parser from 'rss-parser'
import type { Redis } from 'ioredis'
import { SITE } from '@zaviya/shared'
import type { PayloadClient, PipelineSource, SourceItemInput } from '../payload-client.js'
import type { RecentArticle } from '../pipeline/same-story.js'
import { headlineOverlap } from '../pipeline/same-story.js'
import { splitOutlet } from '../pipeline/readable.js'
import { logger } from '../logger.js'
import { TRENDS_KEY, X_TRENDS_KEY } from '../queues-keys.js'
import { ZAVIYA_USER_AGENT } from './extract.js'
import { parseTraffic } from './trends.js'
import { TREND_GAP_MARK } from './trend-gap-mark.js'
import { nudgeTrendClusters, rememberPending, type NudgeDeps, type PendingRedis } from './trend-gap-nudge.js'

/**
 * Trend gap (ZG-21). On 12 Nov "bangladesh vs pakistan" (10K+), "fbr late tax filer atl rules" (5K+), the smog school
 * holidays and "PUBG Mobile 4.7" trended in Pakistan for hours and Zaviya published nothing: the trend feed only
 * ingests the few news links Google attaches to each trend, which are often a single low-tier source, and triage then
 * rejects or reviews a single source. This job closes the gap: for every trending topic with real volume that no
 * Zaviya story of the last 24 h covers, it looks for credible coverage (Google News search in English and Urdu, plus
 * official sites) and ingests 2+ items through the normal path, marked so triage treats the cluster as a trend hit.
 * Facts are never copied: only title, link and outlet are stored; the writer rewrites from the readable sources.
 */

export { TREND_GAP_MARK }

export const TREND_GAP_MIN_VOLUME = 2000
/** At most this many trend-gap stories are started a day (PKT). They count against the daily cap but may use the extra slots. */
export const TREND_GAP_DAILY_MAX = 8
/** 13 Nov: a 10K+ trend may still start a story after the cap is reached, up to twice the cap ("saud shakeel" 20K+ was skipped). */
export const BIG_TREND_VOLUME = 10_000
/** Topics searched per run: keeps the number of requests to Google News small and polite. */
export const TREND_GAP_MAX_PER_RUN = 5
export const TREND_GAP_MAX_ITEMS = 4
/** A story published in this window that matches the topic means there is no gap. */
export const COVERED_WINDOW_MS = 24 * 3_600_000
/** Search results older than this are not today's news. */
export const GAP_ITEM_MAX_AGE_MS = 30 * 3_600_000
/** The trend snapshots are refreshed every few minutes; an older one is not "trending now". */
export const SNAPSHOT_MAX_AGE_MS = 3 * 3_600_000

export const TREND_GAP_LOG_KEY = 'zaviya:trendgap:log'
const SEEN_PREFIX = 'zaviya:trendgap:seen:'
const DAY_PREFIX = 'zaviya:trendgap:day:'

/** Source used for items from official domains (government, cricket boards). Tier 1; never polled (type data). */
export const TREND_GAP_OFFICIAL_SOURCE = {
  key: 'trend-gap-official',
  name: 'Official sites (via Google News)',
  url: 'https://news.google.com/',
  type: 'data' as const,
  trustTier: 1 as const,
  language: 'en',
  pollIntervalSec: 86_400,
}

// ---- topics ---------------------------------------------------------------------------------------------------------

export interface TrendTopic {
  term: string
  volume: number
  from: 'google' | 'x'
  /** Headlines Google attaches to the trend (used to check coverage and sensitivity) */
  newsTitles: string[]
}

/** "PakVsBan" -> "Pak Vs Ban", "#SmogHolidays" -> "Smog Holidays" */
export function cleanTerm(raw: string): string {
  return raw.replace(/^#/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

interface Snapshot {
  at?: string
  trends?: { query?: string; name?: string; traffic?: number; trafficLabel?: string; postsLabel?: string; news?: { title: string }[] }[]
}

function readSnapshot(raw: string | null, from: 'google' | 'x', now: number): TrendTopic[] {
  if (!raw) return []
  let snap: Snapshot
  try {
    snap = JSON.parse(raw) as Snapshot
  } catch {
    return []
  }
  const at = snap.at ? Date.parse(snap.at) : NaN
  if (!Number.isFinite(at) || now - at > SNAPSHOT_MAX_AGE_MS) return []
  const out: TrendTopic[] = []
  for (const t of snap.trends ?? []) {
    const term = cleanTerm(t.query ?? t.name ?? '')
    if (!term) continue
    const volume = from === 'google' ? (t.traffic ?? parseTraffic(t.trafficLabel ?? '')) : parseTraffic(t.postsLabel ?? '')
    out.push({ term, volume, from, newsTitles: (t.news ?? []).map((n) => n.title).filter(Boolean) })
  }
  return out
}

/** Current Google Trends PK and X trends PK topics with real volume (2K+), biggest first, one entry per term. */
export async function loadTopics(redis: Pick<Redis, 'get'>, now = Date.now(), minVolume = TREND_GAP_MIN_VOLUME): Promise<TrendTopic[]> {
  const [g, x] = await Promise.all([redis.get(TRENDS_KEY), redis.get(X_TRENDS_KEY)])
  const seen = new Set<string>()
  const out: TrendTopic[] = []
  for (const t of [...readSnapshot(g, 'google', now), ...readSnapshot(x, 'x', now)].sort((a, b) => b.volume - a.volume)) {
    if (t.volume < minVolume) continue
    const k = topicKey(t.term)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

// ---- matching -------------------------------------------------------------------------------------------------------

const STOP = new Set(['vs', 'v', 'versus', 'the', 'a', 'an', 'and', 'of', 'in', 'on', 'for', 'to', 'at', 'by', 'is', 'are', 'today', 'latest', 'news', 'live', 'update', 'updates', 'new'])
const ALIAS: Record<string, string> = { pak: 'pakistan', ban: 'bangladesh', ind: 'india', aus: 'australia', eng: 'england', afg: 'afghanistan', nz: 'newzealand', wi: 'westindies', sl: 'srilanka', zim: 'zimbabwe', uae: 'uae', saf: 'southafrica' }

/** Cricket team shorthand as Google Trends writes it: "pakw" is Pakistan women, "pak" Pakistan, "u19" the under-19 side. */
const TEAM_NAME: Record<string, string> = { pak: 'Pakistan', ban: 'Bangladesh', ind: 'India', aus: 'Australia', eng: 'England', afg: 'Afghanistan', nz: 'New Zealand', wi: 'West Indies', sl: 'Sri Lanka', zim: 'Zimbabwe', saf: 'South Africa', uae: 'UAE' }
const TEAM_SHORT = /^(pak|ban|ind|aus|eng|afg|nz|wi|sl|zim|saf|uae)(w)?$/

/** "banw vs pakw" -> "Bangladesh women vs Pakistan women", "pak u19 v ban u19" -> "Pakistan U19 vs Bangladesh U19". */
export function expandCricketShorthand(term: string): string {
  return term
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase().replace(/[.,]+$/g, '')
      if (lower === 'v' || lower === 'vs' || lower === 'versus') return 'vs'
      const t = TEAM_SHORT.exec(lower)
      if (t) return `${TEAM_NAME[t[1]!]}${t[2] ? ' women' : ''}`
      const u = /^u-?(\d\d)$/.exec(lower)
      return u ? `U${u[1]}` : w
    })
    .join(' ')
}

/** The two sides of a "X vs Y" topic the other way round ("vs" both orders); null when there are not exactly two sides. */
export function swapSides(expanded: string): string | null {
  const sides = expanded.split(/\s+vs\s+/)
  return sides.length === 2 && sides[0] && sides[1] ? `${sides[1]} vs ${sides[0]}` : null
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** Words of a topic or headline, lower-cased, stemmed, with the usual short forms spelled out (pak -> pakistan). */
export function termTokens(text: string): string[] {
  const out: string[] = []
  const cleaned = splitOutlet(text).headline.toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, ' ')
  for (const raw of cleaned.split(' ')) {
    const w = raw.replace(/^\.+|\.+$/g, '')
    if (!w || STOP.has(w)) continue
    const short = TEAM_SHORT.exec(w)
    if (short?.[2]) {
      // pakw -> pakistan + women, so "Pakistan Women beat Bangladesh Women" covers "banw vs pakw"
      for (const x of [ALIAS[short[1]!] ?? short[1]!, 'women']) if (!out.includes(x)) out.push(x)
      continue
    }
    const t = ALIAS[w] ?? stem(w)
    if (t.length < 2 && !/\d/.test(t)) continue
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/** Stable key of a topic, for the "already handled" memory. */
export function topicKey(term: string): string {
  const toks = termTokens(term).sort()
  return toks.length ? createHash('sha1').update(toks.join(' ')).digest('hex').slice(0, 16) : ''
}

/**
 * Does a headline cover a topic? Most of the topic's words must be in it, at least two when the topic has several,
 * and any word with a digit (u19, 4.7, 2097) must be there, so "Pakistan beat Bangladesh" does not cover "pak u19 vs ban u19".
 */
export function titleMatchesTopic(term: string, title: string, share = 0.6): boolean {
  const T = termTokens(term)
  if (!T.length) return false
  const S = new Set(termTokens(title))
  const matched = T.filter((t) => S.has(t))
  if (T.filter((t) => /\d/.test(t)).some((t) => !S.has(t))) return false
  const need = T.length === 1 ? 1 : Math.max(2, Math.ceil(T.length * share))
  return matched.length >= need
}

/** The published (or waiting) story of the last 24 h that covers this topic, if any. */
export function findCoveringArticle(topic: Pick<TrendTopic, 'term' | 'newsTitles'>, articles: RecentArticle[], now = Date.now()): RecentArticle | null {
  for (const a of articles) {
    const at = Date.parse(a.publishedAt ?? '')
    if (!Number.isFinite(at) || now - at > COVERED_WINDOW_MS) continue
    if (titleMatchesTopic(topic.term, a.title)) return a
    for (const n of topic.newsTitles) {
      const o = headlineOverlap(n, a.title)
      if (o.shared >= 3 && o.ratio >= 0.6 && !o.numbersConflict) return a
    }
  }
  return null
}

// ---- what is skipped ------------------------------------------------------------------------------------------------

/** Kept for the log and tests only: since 13 Nov no trend is skipped for these topics. */
const SENSITIVE: { why: string; re: RegExp }[] = [
  { why: 'army', re: /\b(army|armed forces|military|ispr|isi|generals?|corps commander|field marshal|asim munir|martial law|cantonment|soldiers?|martyred|shaheed|terror\w*|attack(ed)? on|ceasefire|airstrikes?|drone strikes?)\b/i },
  { why: 'politics', re: /\b(imran khan|nawaz|shehbaz|zardari|bilawal|maryam nawaz|pti|pml-?n|ppp|mqm|tlp|jui-?f|anp|politic\w*|parliament|senate|national assembly|prime minister|chief minister|cm punjab|opposition|protest\w*|rigging|no[- ]confidence|constitutional amendment|27th amendment|28th amendment|governor rule|arrest(ed)? of)\b/i },
  { why: 'election', re: /\b(election\w*|by-?election|ballot|voting|polling)\b/i },
  { why: 'judiciary', re: /\b(supreme court|high court|chief justice|judge|judicial|verdict|bail|hearing|sentenced|court order|contempt)\b/i },
  { why: 'religion', re: /\b(islam\w*|muslims?|quran|koran|allah|prophet|blasphem\w*|sectarian|shia|sunni|ahmadi\w*|kafir|jihad\w*|hindu\w*|christian\w*|church|mosque|temple|fatwa|haram|halal|religio\w*|eid|muharram|ashura|ramadan|ramzan|namaz|hajj|umrah)\b/i },
  { why: 'minor/violence', re: /\b(rape\w*|abus\w*|murder\w*|killed|kill(ing)?s?|suicide|child (victim|abuse)|minor girl|molest\w*)\b/i },
  { why: 'army', re: /(فوج|فوجی|آرمی|عسکری|اسٹیبلشمنٹ|جرنیل|جنرل|آئی ایس آئی|مارشل لا|آئی ایس پی آر|شہید)/ },
  { why: 'politics', re: /(عمران خان|نواز شریف|شہباز|زرداری|بلاول|مریم نواز|پی ٹی آئی|مسلم لیگ|پیپلز پارٹی|سیاسی|احتجاج|دھرنا|اسمبلی|سینیٹ)/ },
  { why: 'religion', re: /(توہین|مذہب|اسلام|قرآن|نبی|مسجد|مندر|گرجا|فتویٰ|عید|محرم|عاشورہ|رمضان|حج|عمرہ|احمدی|شیعہ|سنی)/ },
  { why: 'election', re: /(انتخاب|الیکشن|ووٹ)/ },
]

export function sensitiveReason(topic: Pick<TrendTopic, 'term' | 'newsTitles'>): string | null {
  const texts = [topic.term, ...topic.newsTitles]
  for (const s of SENSITIVE) if (texts.some((t) => s.re.test(t))) return s.why
  return null
}

const PK_ANGLE = /\b(pakistan\w*|pak|lahore|karachi|islamabad|peshawar|quetta|punjab|sindh|balochistan|kpk|khyber|fbr|sbp|psl|pcb|pta|nadra|ogra|hbl|jazz|zong|ufone|rupees?|rs\.?\s?\d|bisp|ehsaas|iris|atl)\b|پاکستان|لاہور|کراچی|اسلام آباد/i
const GOSSIP = /\b(actor|actress|singer|rapper|celebrity|celebrities|wedding|married|divorce|dating|engaged|pregnan\w*|girlfriend|boyfriend|affair|bigg boss|kardashian|taylor swift|selena|beyonce|drake|bts|blackpink|hollywood|bollywood|oscars?|grammys?|emmys?|box office|trailer|episode|season finale|netflix|disney|marvel|k-?pop|tiktoker|influencer|nude|leaked video|scandal|net worth|dies at|death of|passed away|rip)\b/i

/** Entertainment gossip and foreign celebrities are skipped unless there is a Pakistan angle. */
export function skipAsGossip(topic: Pick<TrendTopic, 'term' | 'newsTitles'>): boolean {
  // The topic's own words decide; Google's attached headlines only when most of them are gossip ("detangle comb for hair growth"
  // was skipped on 12 Nov because one of three headlines said "Disney")
  const titleHits = topic.newsTitles.filter((t) => GOSSIP.test(t)).length
  const gossip = GOSSIP.test(topic.term) || (topic.newsTitles.length >= 2 && titleHits * 2 > topic.newsTitles.length)
  if (!gossip) return false
  return !PK_ANGLE.test(topic.term)
}

// ---- search ---------------------------------------------------------------------------------------------------------

export interface NewsHit {
  title: string
  headline: string
  outlet: string
  outletHost: string
  link: string
  publishedAt: string
}

const parser = new Parser({ customFields: { item: ['source'] } })

/** rss-parser drops the url attribute of <source url="https://www.dawn.com">Dawn</source>, so the domain is read from the raw XML, per item link. */
function sourceHosts(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1]!
    const link = /<link>\s*(?:<!\[CDATA\[)?\s*([^<\s]+?)\s*(?:\]\]>)?\s*<\/link>/.exec(block)?.[1]
    const url = /<source[^>]*\burl="([^"]+)"/.exec(block)?.[1]
    if (!link || !url) continue
    try {
      out.set(link, new URL(url.replace(/&amp;/g, '&')).hostname.toLowerCase())
    } catch {
      // a broken source url just means the outlet is matched by name
    }
  }
  return out
}

/** Items of a Google News RSS search: headline, outlet name and the outlet's own domain (from the <source> tag). */
export async function parseNewsSearch(xml: string): Promise<NewsHit[]> {
  const feed = await parser.parseString(xml)
  const hosts = sourceHosts(xml)
  const out: NewsHit[] = []
  for (const i of feed.items ?? []) {
    const link = i.link?.trim()
    const title = i.title?.trim()
    if (!link || !title) continue
    const src = (i as unknown as { source?: string | { _?: string } }).source
    const srcName = typeof src === 'string' ? src : (src?._ ?? '')
    const split = splitOutlet(title)
    const at = Date.parse(i.isoDate ?? i.pubDate ?? '')
    out.push({
      title,
      headline: split.headline,
      outlet: (srcName || split.outlet).trim(),
      outletHost: hosts.get(link) ?? '',
      link,
      publishedAt: new Date(Number.isFinite(at) ? at : Date.now()).toISOString(),
    })
  }
  return out
}

/** Official domains worth a targeted search for a topic (cricket boards, FBR, provincial education departments). */
export function officialDomainsFor(term: string): string[] {
  const t = expandCricketShorthand(term).toLowerCase()
  const out: string[] = []
  const pakVs = /\b(pak|pakistan)\b.*\b(vs|v|versus)\b|\b(vs|v|versus)\b.*\b(pak|pakistan)\b/.test(t)
  if (pakVs || /\b(cricket|u-?19|u-?16|asia cup|psl|t20|odi|wickets?|icc|pcb)\b/.test(t)) out.push('pcb.com.pk', 'asiancricket.org', 'icc-cricket.com')
  if (/\b(fbr|tax|filer|atl|sro|iris|customs|income tax|sales tax)\b/.test(t)) out.push('fbr.gov.pk')
  if (/\b(school|schools|holiday|holidays|smog|exam|exams|board|admission|result|education)\b/.test(t)) out.push('punjab.gov.pk', 'sindh.gov.pk', 'kp.gov.pk', 'moe.gov.pk')
  if (/\b(sbp|state bank|policy rate|inflation)\b/.test(t)) out.push('sbp.org.pk')
  if (/\b(weather|rain|rainfall|forecast|temperature|heatwave|heat wave|cold wave|fog|monsoon|pmd|met office)\b/.test(t)) out.push('pmd.gov.pk', 'ndma.gov.pk')
  if (/\b(pta|telecom|internet)\b/.test(t)) out.push('pta.gov.pk')
  if (/\b(petrol|diesel|ogra|gas price)\b/.test(t)) out.push('ogra.org.pk')
  return out
}

export interface SearchSpec {
  url: string
  lang: 'en' | 'ur'
  official: boolean
}

export function searchUrls(term: string): SearchSpec[] {
  const q = (query: string, lang: 'en' | 'ur') =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=${lang}-PK&gl=PK&ceid=PK:${lang}`
  // Trends writes "banw vs pakw"; newsrooms write "Bangladesh women vs Pakistan women" (and either side first)
  const expanded = expandCricketShorthand(term)
  const swapped = swapSides(expanded)
  const specs: SearchSpec[] = [
    { url: q(term, 'en'), lang: 'en', official: false },
    { url: q(term, 'ur'), lang: 'ur', official: false },
  ]
  if (expanded !== term) specs.push({ url: q(expanded, 'en'), lang: 'en', official: false })
  if (swapped) specs.push({ url: q(swapped, 'en'), lang: 'en', official: false })
  const domains = officialDomainsFor(term)
  // the PCB site and the other cricket bodies, searched with the spelled-out names
  if (domains.length) specs.push({ url: q(`${expanded} (${domains.map((d) => `site:${d}`).join(' OR ')})`, 'en'), lang: 'en', official: true })
  return specs
}

// ---- credibility ----------------------------------------------------------------------------------------------------

const OFFICIAL_HOST = /(^|\.)((gov|gop|gos|gob|gkp)\.pk|pcb\.com\.pk|asiancricket\.org|theacc\.com|icc-cricket\.com|sbp\.org\.pk|nadra\.gov\.pk)$/i

export function isOfficialHost(host: string): boolean {
  return OFFICIAL_HOST.test(host.replace(/^www\./, ''))
}

/** "https://www.thenews.com.pk/rss/1/1" -> "thenews.com.pk"; "feeds.bbci.co.uk" -> "bbc.co.uk" (same publisher). */
export function baseHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  const parts = h.split('.')
  const second = parts[parts.length - 2] ?? ''
  const n = parts[parts.length - 1] === 'pk' || ['co', 'com', 'org', 'gov', 'net'].includes(second) ? 3 : 2
  const base = parts.slice(-Math.min(n, parts.length)).join('.')
  return base === 'bbci.co.uk' || base === 'bbc.com' ? 'bbc.co.uk' : base
}

const NAME_GENERIC = new Set(['the', 'english', 'urdu', 'tv', 'international', 'online', 'pakistan', 'official', 'wire', 'world', 'news'])
function nameCore(name: string): string {
  const words = name.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean)
  const core = words.filter((w) => !NAME_GENERIC.has(w))
  return (core.length ? core : words.filter((w) => w !== 'the')).join(' ')
}

export interface OutletMatch {
  source: Pick<PipelineSource, 'id' | 'name' | 'trustTier'>
  official: boolean
}

/**
 * The tier 1-2 outlet of our own sources list that published this item, or the official source for an official domain.
 * Google News, Trends and X sources, tier-3 outlets and anything unknown are not credible enough: null.
 */
export function matchOutlet(hit: NewsHit, sources: PipelineSource[], lang: 'en' | 'ur', official?: Pick<PipelineSource, 'id' | 'name' | 'trustTier'> | null): OutletMatch | null {
  const credible = sources.filter((s) => s.type === 'rss' && s.trustTier <= 2 && !/google|trends|discovery/i.test(s.name))
  const host = hit.outletHost ? baseHost(hit.outletHost) : ''
  const byHost = host ? credible.filter((s) => { try { return baseHost(new URL(s.url).hostname) === host } catch { return false } }) : []
  const core = nameCore(hit.outlet)
  const byName = core ? credible.filter((s) => nameCore(s.name) === core) : []
  const pool = byHost.length ? byHost : byName
  if (pool.length) {
    const best = pool.find((s) => s.language === lang) ?? pool[0]!
    return { source: best, official: false }
  }
  if (official && hit.outletHost && isOfficialHost(hit.outletHost)) return { source: official, official: true }
  return null
}

export interface Pick2 {
  hit: NewsHit
  match: OutletMatch
  lang: 'en' | 'ur'
}

/**
 * Keeps hits that are about the topic, fresh, and from a credible outlet; one per link; outlets spread so the cluster
 * has several distinct sources. Returns at most TREND_GAP_MAX_ITEMS.
 */
export function pickCredible(
  term: string,
  batches: { hits: NewsHit[]; lang: 'en' | 'ur' }[],
  sources: PipelineSource[],
  official: Pick<PipelineSource, 'id' | 'name' | 'trustTier'> | null,
  now = Date.now(),
): Pick2[] {
  const seenLinks = new Set<string>()
  const all: Pick2[] = []
  for (const b of batches) {
    for (const hit of b.hits) {
      if (seenLinks.has(hit.link)) continue
      if (now - Date.parse(hit.publishedAt) > GAP_ITEM_MAX_AGE_MS) continue
      if (!titleMatchesTopic(term, hit.headline, 0.5)) continue
      const match = matchOutlet(hit, sources, b.lang, official)
      if (!match) continue
      seenLinks.add(hit.link)
      all.push({ hit, match, lang: b.lang })
    }
  }
  // official and tier 1 first, then tier 2; one item per source until every source is represented, then the rest
  all.sort((a, b) => Number(b.match.official) - Number(a.match.official) || a.match.source.trustTier - b.match.source.trustTier)
  const first: Pick2[] = []
  const rest: Pick2[] = []
  const used = new Set<string>()
  for (const p of all) (used.has(p.match.source.id) ? rest : first).push(p), used.add(p.match.source.id)
  return [...first, ...rest].slice(0, TREND_GAP_MAX_ITEMS)
}

/** Topics where the government body is itself the authority (weather by PMD, taxes by FBR, rates by SBP, BISP, results): one official source is enough. */
const OFFICIAL_IS_ENOUGH = /\b(weather|rain|rainfall|forecast|temperature|heatwave|heat wave|cold wave|fog|monsoon|pmd|met office|fbr|sbp|policy rate|nadra|pta|ogra|bisp|hec|ppsc|fpsc|datesheet|date sheet)\b/i

/** The bar for ingesting: 2+ items and 2+ distinct outlets, or an official item plus one more; one official item alone for weather and government data. */
export function enoughSources(picks: Pick2[], term = ''): boolean {
  if (picks.length === 1 && picks[0]!.match.official && OFFICIAL_IS_ENOUGH.test(expandCricketShorthand(term))) return true
  if (picks.length < 2) return false
  return new Set(picks.map((p) => p.match.source.id)).size >= 2 || picks.some((p) => p.match.official)
}

export function toSourceItems(topic: TrendTopic, picks: Pick2[]): SourceItemInput[] {
  const label = topic.volume >= 1000 ? `${Math.round(topic.volume / 100) / 10}K+` : String(topic.volume)
  return picks.map(({ hit, match, lang }) => {
    const summary = `${TREND_GAP_MARK} "${topic.term}" (${label} ${topic.from === 'x' ? 'posts on X' : 'searches'}) · ${hit.outlet || match.source.name}`
    return {
      sourceId: match.source.id,
      externalId: hit.link,
      url: hit.link,
      title: hit.title,
      summary,
      publishedAt: hit.publishedAt,
      lang,
      hash: createHash('sha1').update(`${hit.title}|${hit.link}|${summary}`).digest('hex'),
    }
  })
}

// ---- the job --------------------------------------------------------------------------------------------------------

export type GapOutcome = 'ingested' | 'already-ingested' | 'no-credible-source' | 'skipped-sensitive' | 'skipped-entertainment' | 'skipped-daily-limit' | 'search-failed'

export interface GapLogEntry {
  at: string
  term: string
  volume: number
  from: 'google' | 'x'
  outcome: GapOutcome
  detail?: string
  items?: { outlet: string; title: string; url: string }[]
}

/** How long a decision stands before the topic is looked at again. */
const SEEN_TTL_S: Record<GapOutcome, number> = {
  ingested: 12 * 3600,
  'already-ingested': 6 * 3600,
  'no-credible-source': 40 * 60,
  'skipped-sensitive': 24 * 3600,
  'skipped-entertainment': 24 * 3600,
  'skipped-daily-limit': 0,
  'search-failed': 15 * 60,
}

export function pktDayKey(now: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SITE.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
}

export interface TrendGapDeps {
  redis: Pick<Redis, 'get' | 'set' | 'incr' | 'expire' | 'lpush' | 'ltrim'> & PendingRedis
  payload: Pick<PayloadClient, 'getSources' | 'recentArticles' | 'ensureSource'>
  /** Saves items and queues them for embedding/clustering (queues.ts storeItems) */
  storeItems: (items: SourceItemInput[]) => Promise<{ inserted: { id: string; externalId: string }[]; skipped: number }>
  fetchFn?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  dailyMax?: number
  maxPerRun?: number
  minVolume?: number
  /** Re-queues triage or write for clusters the ingested items joined but that stalled (trend-gap-nudge.ts); off when absent */
  nudge?: Omit<NudgeDeps, 'redis' | 'now'>
}

async function searchOne(spec: SearchSpec, fetchFn: typeof fetch): Promise<NewsHit[]> {
  const res = await fetchFn(spec.url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`news search ${res.status}`)
  return parseNewsSearch(await res.text())
}

async function record(deps: TrendGapDeps, entry: GapLogEntry, key: string): Promise<void> {
  logger.info({ trendGap: entry }, `trend gap: "${entry.term}" -> ${entry.outcome}${entry.detail ? ` (${entry.detail})` : ''}`)
  const ttl = SEEN_TTL_S[entry.outcome]
  try {
    if (ttl > 0) await deps.redis.set(`${SEEN_PREFIX}${key}`, entry.outcome, 'EX', ttl)
    await deps.redis.lpush(TREND_GAP_LOG_KEY, JSON.stringify(entry))
    await deps.redis.ltrim(TREND_GAP_LOG_KEY, 0, 299)
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'trend gap: could not save the log entry')
  }
}

export interface TrendGapRun {
  topics: number
  gaps: GapLogEntry[]
}

export async function runTrendGap(deps: TrendGapDeps): Promise<TrendGapRun> {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const fetchFn = deps.fetchFn ?? fetch
  const dailyMax = deps.dailyMax ?? TREND_GAP_DAILY_MAX
  const maxPerRun = deps.maxPerRun ?? TREND_GAP_MAX_PER_RUN

  if (deps.nudge) {
    await nudgeTrendClusters({ ...deps.nudge, redis: deps.redis, now }).catch((e) => logger.warn({ err: e instanceof Error ? e.message : e }, 'trend gap: nudge failed'))
  }
  const topics = await loadTopics(deps.redis, now(), deps.minVolume)
  const run: TrendGapRun = { topics: topics.length, gaps: [] }
  if (!topics.length) return run

  const articles = await deps.payload.recentArticles().catch((e) => {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'trend gap: could not read recent articles, run skipped')
    return null
  })
  // Without our own articles every topic would look like a gap: better to do nothing than to ingest blind
  if (!articles) return run

  const dayKey = `${DAY_PREFIX}${pktDayKey(now())}`
  let startedToday = Number((await deps.redis.get(dayKey)) ?? 0) || 0
  let sources: PipelineSource[] | null = null
  let official: Pick<PipelineSource, 'id' | 'name' | 'trustTier'> | null | undefined
  let processed = 0

  for (const topic of topics) {
    if (processed >= maxPerRun) break
    const key = topicKey(topic.term)
    if (findCoveringArticle(topic, articles, now())) continue
    if (await deps.redis.get(`${SEEN_PREFIX}${key}`)) continue

    const base = { at: new Date(now()).toISOString(), term: topic.term, volume: topic.volume, from: topic.from }
    const done = async (outcome: GapOutcome, detail?: string, items?: GapLogEntry['items']) => {
      const entry: GapLogEntry = { ...base, outcome, ...(detail ? { detail } : {}), ...(items ? { items } : {}) }
      run.gaps.push(entry)
      await record(deps, entry, key)
    }

    // 13 Nov (Waleed): trends about the army, politics, courts, religion or violence are ingested like any other trend; the
    // credible-source rules below still apply.
    if (skipAsGossip(topic)) {
      await done('skipped-entertainment', 'gossip or foreign celebrity without a Pakistan angle')
      continue
    }
    const big = topic.volume >= BIG_TREND_VOLUME
    if (startedToday >= (big ? dailyMax * 2 : dailyMax)) {
      await done('skipped-daily-limit', `${startedToday} trend-gap stories already started today (limit ${dailyMax})`)
      continue
    }

    processed++
    if (!sources) {
      sources = (await deps.payload.getSources().catch(() => ({ sources: [] as PipelineSource[] }))).sources
      const found = sources.find((s) => s.key === TREND_GAP_OFFICIAL_SOURCE.key)
      if (found) official = found
      else {
        const made = await deps.payload.ensureSource(TREND_GAP_OFFICIAL_SOURCE).catch((e) => {
          logger.warn({ err: e instanceof Error ? e.message : e }, 'trend gap: could not create the official-sites source')
          return null
        })
        official = made ? { id: made.id, name: TREND_GAP_OFFICIAL_SOURCE.name, trustTier: 1 } : null
      }
    }

    const batches: { hits: NewsHit[]; lang: 'en' | 'ur' }[] = []
    for (const spec of searchUrls(topic.term)) {
      try {
        batches.push({ hits: await searchOne(spec, fetchFn), lang: spec.lang })
      } catch (e) {
        logger.debug({ err: e instanceof Error ? e.message : e, url: spec.url }, 'trend gap: search failed')
      }
      await sleep(1200)
    }
    if (batches.length === 0) {
      await done('search-failed', 'Google News search unavailable')
      continue
    }

    const picks = pickCredible(topic.term, batches, sources, official ?? null, now())
    if (!enoughSources(picks, topic.term)) {
      await done('no-credible-source', `${picks.length} credible item(s) found, 2+ from different outlets needed`)
      continue
    }

    const items = toSourceItems(topic, picks)
    const res = await deps.storeItems(items)
    const shown = picks.map((p) => ({ outlet: p.hit.outlet || p.match.source.name, title: p.hit.headline, url: p.hit.link }))
    if (res.inserted.length === 0) {
      await done('already-ingested', `${res.skipped} item(s) were already stored`, shown)
      continue
    }
    await rememberPending(deps.redis, topic.term, res.inserted.map((i) => i.id), now()).catch(() => undefined)
    startedToday = Number(await deps.redis.incr(dayKey))
    await deps.redis.expire(dayKey, 36 * 3600)
    await done('ingested', `${res.inserted.length} new item(s) from ${new Set(picks.map((p) => p.match.source.name)).size} outlet(s)`, shown)
  }
  return run
}
