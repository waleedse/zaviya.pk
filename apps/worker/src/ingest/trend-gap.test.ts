import { describe, expect, it, vi } from 'vitest'
import {
  TREND_GAP_LOG_KEY,
  baseHost,
  cleanTerm,
  enoughSources,
  findCoveringArticle,
  loadTopics,
  matchOutlet,
  parseNewsSearch,
  pickCredible,
  runTrendGap,
  searchUrls,
  sensitiveReason,
  skipAsGossip,
  titleMatchesTopic,
  toSourceItems,
  type NewsHit,
  type TrendTopic,
} from './trend-gap.js'
import { isTrendGapCluster } from './trend-gap-mark.js'
import { TRENDS_KEY } from '../queues-keys.js'
import { dailyCapReached } from '../pipeline/publish.js'
import { applyTriageRules } from '../pipeline/triage-rules.js'
import type { PipelineSource } from '../payload-client.js'
import type { TriageResult } from '@zaviya/shared'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString()

const src = (id: string, name: string, url: string, trustTier: 1 | 2 | 3, language = 'en', type = 'rss'): PipelineSource => ({ id, name, url, type, trustTier, language, pollIntervalSec: 300 })
const SOURCES: PipelineSource[] = [
  src('1', 'Dawn', 'https://www.dawn.com/feeds/home', 2),
  src('2', 'Geo English', 'https://www.geo.tv/rss/1/1', 2),
  src('3', 'The News International', 'https://www.thenews.com.pk/rss/1/1', 2),
  src('4', 'BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml', 2),
  src('5', 'BBC Urdu', 'https://feeds.bbci.co.uk/urdu/rss.xml', 2, 'ur'),
  src('6', 'ProPakistani', 'https://propakistani.pk/feed/', 3),
  src('7', 'Google News — Pakistan', 'https://news.google.com/rss/search?q=Pakistan', 2, 'en', 'gnews'),
  src('8', 'APP (Associated Press of Pakistan)', 'https://www.app.com.pk/feed/', 1),
]
const OFFICIAL = { id: '99', name: 'Official sites (via Google News)', trustTier: 1 as const }

const hit = (headline: string, outlet: string, host: string, minsAgo = 60): NewsHit => ({
  title: `${headline} - ${outlet}`,
  headline,
  outlet,
  outletHost: host,
  link: `https://news.google.com/rss/articles/${encodeURIComponent(headline)}-${outlet}`,
  publishedAt: iso(minsAgo),
})

describe('gap detection', () => {
  const topic: TrendTopic = { term: 'pak u19 vs ban u19', volume: 10_000, from: 'google', newsTitles: [] }

  it('matches topic words, spelling out pak and ban', () => {
    expect(titleMatchesTopic('bangladesh vs pakistan', 'Pakistan beat Bangladesh by 9 wickets in the semi-final')).toBe(true)
    expect(titleMatchesTopic('pak u19 vs ban u19', 'Pakistan U19 beat Bangladesh U19 by 9 wickets')).toBe(true)
  })

  it('does not call it covered when a required number is missing', () => {
    expect(titleMatchesTopic('pak u19 vs ban u19', 'Pakistan beat Bangladesh in the T20 series')).toBe(false)
    expect(titleMatchesTopic('pubg mobile 4.7', 'PUBG Mobile 3.9 update arrives')).toBe(false)
    expect(titleMatchesTopic('pubg mobile 4.7', 'PUBG Mobile 4.7 update: new map and features')).toBe(true)
  })

  it('needs most words of a long topic', () => {
    expect(titleMatchesTopic('fbr late tax filer atl rules', 'FBR notifies new ATL rules for late filers')).toBe(true)
    expect(titleMatchesTopic('fbr late tax filer atl rules', 'FBR collects record revenue')).toBe(false)
    expect(titleMatchesTopic('smog school holidays', 'Government plans new bridge')).toBe(false)
  })

  it('finds a story of the last 24 h and ignores older ones', () => {
    const fresh = [{ id: '1', title: 'Pakistan U19 beat Bangladesh U19 in Asia Cup semi-final', publishedAt: iso(120), published: true }]
    const old = [{ id: '2', title: 'Pakistan U19 beat Bangladesh U19 in Asia Cup semi-final', publishedAt: iso(26 * 60), published: true }]
    expect(findCoveringArticle(topic, fresh, NOW)?.id).toBe('1')
    expect(findCoveringArticle(topic, old, NOW)).toBeNull()
    expect(findCoveringArticle(topic, [{ id: '3', title: 'Petrol price cut by Rs5', publishedAt: iso(10), published: true }], NOW)).toBeNull()
  })

  it('uses the headlines Google attaches to the trend', () => {
    const t = { term: 'smog holidays', newsTitles: ['Punjab announces school closure due to smog in Lahore'] }
    const arts = [{ id: '4', title: 'Smog: Punjab announces school closure in Lahore', publishedAt: iso(30), published: true }]
    expect(findCoveringArticle(t, arts, NOW)?.id).toBe('4')
  })

  it('reads topics with real volume from both snapshots, biggest first, once each', async () => {
    const X_KEY = 'zaviya:trends:x'
    const snap = (key: string) =>
      key === TRENDS_KEY
        ? JSON.stringify({ at: iso(10), trends: [{ query: 'bangladesh vs pakistan', traffic: 10_000 }, { query: 'tiny topic', traffic: 500 }, { query: 'fbr atl', traffic: 5000, news: [{ title: 'FBR sets ATL rules' }] }] })
        : key === X_KEY
          ? JSON.stringify({ at: iso(5), trends: [{ name: '#PakVsBan', postsLabel: '12.5K posts' }, { name: 'Bangladesh vs Pakistan', postsLabel: '3K posts' }, { name: 'quiet', postsLabel: '900 posts' }] })
          : null
    const topics = await loadTopics({ get: async (k: string) => snap(k) }, NOW)
    expect(topics.map((t) => `${t.term}:${t.volume}`)).toEqual(['Pak Vs Ban:12500', 'fbr atl:5000'])
    // an old snapshot is not "trending now"
    const old = await loadTopics({ get: async () => JSON.stringify({ at: iso(5 * 60), trends: [{ query: 'x', traffic: 99_999 }] }) }, NOW)
    expect(old).toEqual([])
  })

  it('cleans hashtag terms', () => {
    expect(cleanTerm('#SmogHolidays')).toBe('Smog Holidays')
  })
})

describe('skipping', () => {
  it('skips army, politics, religion, courts and elections', () => {
    expect(sensitiveReason({ term: 'asim munir', newsTitles: ['Army chief visits Quetta'] })).toBe('army')
    expect(sensitiveReason({ term: 'imran khan', newsTitles: [] })).toBe('politics')
    expect(sensitiveReason({ term: 'ashura security', newsTitles: [] })).toBe('religion')
    expect(sensitiveReason({ term: 'supreme court hearing', newsTitles: [] })).toBe('judiciary')
    expect(sensitiveReason({ term: 'by election results', newsTitles: [] })).toBe('election')
    expect(sensitiveReason({ term: 'عمران خان', newsTitles: [] })).toBe('politics')
  })
  it('lets sport, tax, schools and games through', () => {
    for (const term of ['bangladesh vs pakistan', 'fbr late tax filer atl rules', 'smog school holidays', 'pubg mobile 4.7']) {
      expect(sensitiveReason({ term, newsTitles: [] })).toBeNull()
    }
  })
  it('skips gossip and foreign celebrities unless there is a Pakistan angle', () => {
    expect(skipAsGossip({ term: 'taylor swift wedding', newsTitles: [] })).toBe(true)
    expect(skipAsGossip({ term: 'hollywood actress divorce', newsTitles: [] })).toBe(true)
    expect(skipAsGossip({ term: 'pakistani actress wedding', newsTitles: [] })).toBe(false)
    expect(skipAsGossip({ term: 'pubg mobile 4.7', newsTitles: [] })).toBe(false)
  })
  it('does not skip a topic because one of Google\'s headlines mentions Disney (12 Nov: detangle comb)', () => {
    const newsTitles = ['Could this experimental electric comb be a cure for baldness?', 'Device inspired by Disney’s ‘Tangled’ could help battle hair loss', 'Comb regrows hair via electrical stimulation']
    expect(skipAsGossip({ term: 'detangle comb for hair growth', newsTitles })).toBe(false)
    // but a topic whose headlines are mostly gossip still is
    expect(skipAsGossip({ term: 'fan meet viral', newsTitles: ['Singer dating rumours', 'Actress wedding photos', 'Weather today'] })).toBe(true)
  })
})

describe('source filtering', () => {
  it('maps the outlet to our tier 1-2 sources by domain or name', () => {
    expect(matchOutlet(hit('x', 'Dawn', 'www.dawn.com'), SOURCES, 'en')?.source.id).toBe('1')
    expect(matchOutlet(hit('x', 'Geo News', 'www.geo.tv'), SOURCES, 'en')?.source.id).toBe('2')
    expect(matchOutlet(hit('x', 'The News International', ''), SOURCES, 'en')?.source.id).toBe('3')
    expect(matchOutlet(hit('x', 'BBC', 'www.bbc.com'), SOURCES, 'en')?.source.id).toBe('4')
    expect(matchOutlet(hit('x', 'BBC', 'www.bbc.com'), SOURCES, 'ur')?.source.id).toBe('5')
    expect(matchOutlet(hit('x', 'APP', 'www.app.com.pk'), SOURCES, 'en')?.source.trustTier).toBe(1)
  })
  it('rejects tier 3, aggregators and unknown outlets', () => {
    expect(matchOutlet(hit('x', 'ProPakistani', 'propakistani.pk'), SOURCES, 'en')).toBeNull()
    expect(matchOutlet(hit('x', 'Google News', 'news.google.com'), SOURCES, 'en')).toBeNull()
    expect(matchOutlet(hit('x', 'Some Random Blog', 'randomblog.example'), SOURCES, 'en', OFFICIAL)).toBeNull()
  })
  it('accepts official domains as the official source', () => {
    const m = matchOutlet(hit('x', 'Federal Board of Revenue', 'www.fbr.gov.pk'), SOURCES, 'en', OFFICIAL)
    expect(m).toMatchObject({ official: true, source: { id: '99' } })
    expect(matchOutlet(hit('x', 'PCB', 'www.pcb.com.pk'), SOURCES, 'en', OFFICIAL)?.official).toBe(true)
    expect(matchOutlet(hit('x', 'Punjab Government', 'education.punjab.gov.pk'), SOURCES, 'en', OFFICIAL)?.official).toBe(true)
    expect(matchOutlet(hit('x', 'Federal Board of Revenue', 'www.fbr.gov.pk'), SOURCES, 'en', null)).toBeNull()
  })
  it('normalises hosts', () => {
    expect(baseHost('www.thenews.com.pk')).toBe('thenews.com.pk')
    expect(baseHost('urdu.arynews.tv')).toBe('arynews.tv')
    expect(baseHost('feeds.bbci.co.uk')).toBe('bbc.co.uk')
  })

  const term = 'pak u19 vs ban u19'
  it('keeps relevant, fresh, credible items and spreads the outlets', () => {
    const hits = [
      hit('Pakistan U19 beat Bangladesh U19 by 9 wickets', 'Dawn', 'www.dawn.com'),
      hit('Pakistan U19 beat Bangladesh U19 by nine wickets in Asia Cup semi', 'Dawn', 'www.dawn.com', 90),
      hit('Pakistan U19 reach Asia Cup final after Bangladesh U19 win', 'Geo News', 'www.geo.tv'),
      hit('Pakistan U19 v Bangladesh U19 live', 'ProPakistani', 'propakistani.pk'),
      hit('Petrol price cut', 'Dawn', 'www.dawn.com'),
      hit('Pakistan U19 beat Bangladesh U19 last week', 'The News International', 'www.thenews.com.pk', 60 * 40),
    ]
    const picks = pickCredible(term, [{ hits, lang: 'en' }], SOURCES, OFFICIAL, NOW)
    expect(picks.map((p) => p.match.source.id)).toEqual(['1', '2', '1'])
    expect(enoughSources(picks)).toBe(true)
  })
  it('needs two items from two outlets, or an official item', () => {
    const one = pickCredible(term, [{ hits: [hit('Pakistan U19 beat Bangladesh U19', 'Dawn', 'www.dawn.com')], lang: 'en' }], SOURCES, OFFICIAL, NOW)
    expect(enoughSources(one)).toBe(false)
    const sameOutlet = pickCredible(term, [{ hits: [hit('Pakistan U19 beat Bangladesh U19', 'Dawn', 'www.dawn.com'), hit('Pakistan U19 win over Bangladesh U19 analysis', 'Dawn', 'www.dawn.com')], lang: 'en' }], SOURCES, OFFICIAL, NOW)
    expect(enoughSources(sameOutlet)).toBe(false)
    const withOfficial = pickCredible(term, [{ hits: [hit('Pakistan U19 beat Bangladesh U19', 'Dawn', 'www.dawn.com'), hit('Pakistan U19 win over Bangladesh U19 report', 'ACC', 'www.pcb.com.pk')], lang: 'en' }], SOURCES, OFFICIAL, NOW)
    expect(enoughSources(withOfficial)).toBe(true)
  })
  it('marks ingested items so triage sees a trend hit, and stores only title, link and outlet', () => {
    const picks = pickCredible(term, [{ hits: [hit('Pakistan U19 beat Bangladesh U19', 'Dawn', 'www.dawn.com'), hit('Pakistan U19 win over Bangladesh U19', 'Geo News', 'www.geo.tv')], lang: 'en' }], SOURCES, OFFICIAL, NOW)
    const items = toSourceItems({ term, volume: 10_000, from: 'google', newsTitles: [] }, picks)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ lang: 'en' })
    expect(items[0]!.summary).toContain('10K+')
    expect(items[0]!.contentText).toBeUndefined()
    expect(isTrendGapCluster(items)).toBe(true)
    expect(isTrendGapCluster([{ summary: 'Trending in Pakistan: "x"' }])).toBe(false)
  })
})

describe('search', () => {
  it('searches Google News PK in English and Urdu with a one-day window, plus official sites when relevant', () => {
    const urls = searchUrls('fbr late tax filer atl rules')
    expect(urls.map((u) => u.lang)).toEqual(['en', 'ur', 'en'])
    expect(urls[0]!.url).toContain('hl=en-PK&gl=PK&ceid=PK:en')
    expect(urls[1]!.url).toContain('hl=ur-PK&gl=PK&ceid=PK:ur')
    expect(decodeURIComponent(urls[0]!.url)).toContain('when:1d')
    expect(decodeURIComponent(urls[2]!.url)).toContain('site:fbr.gov.pk')
    expect(searchUrls('pubg mobile 4.7')).toHaveLength(2)
    expect(decodeURIComponent(searchUrls('pak u19 vs ban u19').find((s) => s.official)!.url)).toContain('site:pcb.com.pk')
  })
  it('reads outlet and domain from the source tag', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Pakistan win - Dawn</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Thu, 12 Nov 2026 09:00:00 GMT</pubDate><source url="https://www.dawn.com">Dawn</source></item></channel></rss>`
    const hits = await parseNewsSearch(xml)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ headline: 'Pakistan win', outlet: 'Dawn', outletHost: 'www.dawn.com' })
  })
})

// ---- the job and its daily cap ---------------------------------------------------------------------------------------

function fakeRedis(initial: Record<string, string> = {}) {
  const kv = new Map(Object.entries(initial))
  const lists = new Map<string, string[]>()
  const hashes = new Map<string, Record<string, string>>()
  return {
    kv,
    lists,
    hashes,
    get: async (k: string) => kv.get(k) ?? null,
    set: async (k: string, v: string) => (kv.set(k, v), 'OK'),
    incr: async (k: string) => {
      const n = Number(kv.get(k) ?? 0) + 1
      kv.set(k, String(n))
      return n
    },
    expire: async () => 1,
    lpush: async (k: string, v: string) => {
      const l = lists.get(k) ?? []
      l.unshift(v)
      lists.set(k, l)
      return l.length
    },
    ltrim: async () => 'OK',
    hset: async (k: string, f: string, v: string) => {
      const h = hashes.get(k) ?? {}
      h[f] = v
      hashes.set(k, h)
      return 1
    },
    hdel: async (k: string, f: string) => (delete (hashes.get(k) ?? {})[f], 1),
    hgetall: async (k: string) => ({ ...(hashes.get(k) ?? {}) }),
  }
}

const feedFor = (items: NewsHit[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${items.map((h) => `<item><title>${h.title}</title><link>${h.link}</link><pubDate>${new Date(h.publishedAt).toUTCString()}</pubDate><source url="https://${h.outletHost}">${h.outlet}</source></item>`).join('')}</channel></rss>`

type Art = { id: string; title: string; publishedAt: string; published: boolean }

function setup(opts: { trends: { query: string; traffic: number }[]; articles?: Art[]; news: (term: string) => NewsHit[] }) {
  const redis = fakeRedis({ [TRENDS_KEY]: JSON.stringify({ at: new Date(NOW - 5 * 60_000).toISOString(), trends: opts.trends }) })
  const stored: { externalId: string }[][] = []
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const u = new URL(String(url))
    const q = u.searchParams.get('q')!.replace(/ when:1d.*$/, '').replace(/ \(site:.*$/, '')
    return new Response(feedFor(u.searchParams.get('ceid') === 'PK:ur' ? [] : opts.news(q)), { status: 200 })
  })
  const deps = {
    redis,
    payload: {
      getSources: async () => ({ sources: SOURCES }),
      recentArticles: async (): Promise<Art[]> => opts.articles ?? [],
      ensureSource: async () => ({ id: '99', created: false }),
    },
    storeItems: async (items: { externalId: string }[]) => {
      stored.push(items)
      return { inserted: items.map((i, n) => ({ id: String(n), externalId: i.externalId })), skipped: 0 }
    },
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => NOW,
    sleep: async () => undefined,
  }
  return { redis, stored, fetchFn, deps }
}

const u19News = () => [
  hit('Pakistan U19 beat Bangladesh U19 by 9 wickets', 'Dawn', 'www.dawn.com'),
  hit('Pakistan U19 into Asia Cup final after Bangladesh U19 win', 'Geo News', 'www.geo.tv'),
]

describe('runTrendGap', () => {
  it('ingests credible sources for an uncovered trend and logs it', async () => {
    const s = setup({ trends: [{ query: 'pak u19 vs ban u19', traffic: 10_000 }], news: u19News })
    const run = await runTrendGap(s.deps as never)
    expect(run.gaps).toHaveLength(1)
    expect(run.gaps[0]).toMatchObject({ term: 'pak u19 vs ban u19', outcome: 'ingested', volume: 10_000 })
    expect(run.gaps[0]!.items).toHaveLength(2)
    expect(s.stored).toHaveLength(1)
    expect(s.stored[0]).toHaveLength(2)
    expect(JSON.parse(s.redis.lists.get(TREND_GAP_LOG_KEY)![0]!).outcome).toBe('ingested')
    // asked again 25 minutes later: already handled, no second search
    const calls = s.fetchFn.mock.calls.length
    const again = await runTrendGap(s.deps as never)
    expect(again.gaps).toHaveLength(0)
    expect(s.fetchFn.mock.calls.length).toBe(calls)
  })

  it('does nothing for a topic Zaviya already covers, or with too little volume', async () => {
    const s = setup({
      trends: [{ query: 'pak u19 vs ban u19', traffic: 10_000 }, { query: 'small thing', traffic: 800 }],
      articles: [{ id: '1', title: 'Pakistan U19 beat Bangladesh U19 in Asia Cup semi-final', publishedAt: iso(90), published: true }],
      news: u19News,
    })
    const run = await runTrendGap(s.deps as never)
    expect(run.gaps).toHaveLength(0)
    expect(s.fetchFn).not.toHaveBeenCalled()
  })

  it('logs "no credible source" and tries again later', async () => {
    const s = setup({ trends: [{ query: 'pubg mobile 4.7', traffic: 20_000 }], news: () => [hit('PUBG Mobile 4.7 update', 'Some Blog', 'someblog.example')] })
    const run = await runTrendGap(s.deps as never)
    expect(run.gaps[0]).toMatchObject({ outcome: 'no-credible-source' })
    expect(s.stored).toHaveLength(0)
  })

  it('skips sensitive and gossip topics without searching', async () => {
    const s = setup({ trends: [{ query: 'imran khan court hearing', traffic: 50_000 }, { query: 'taylor swift wedding', traffic: 30_000 }], news: u19News })
    const run = await runTrendGap(s.deps as never)
    expect(run.gaps.map((g) => g.outcome)).toEqual(['skipped-sensitive', 'skipped-entertainment'])
    expect(s.fetchFn).not.toHaveBeenCalled()
  })

  it('starts at most 6 trend-gap stories a day', async () => {
    const trends = Array.from({ length: 8 }, (_, i) => ({ query: `topic${i} update match`, traffic: 9000 - i }))
    const news = (term: string) => [hit(`${term} headline report`, 'Dawn', 'www.dawn.com'), hit(`${term} reported by Geo`, 'Geo News', 'www.geo.tv')]
    const s = setup({ trends, news })
    // 5 searches a run: the first run starts 5, the second starts 1 and stops at the limit
    const r1 = await runTrendGap(s.deps as never)
    expect(r1.gaps.filter((g) => g.outcome === 'ingested')).toHaveLength(5)
    const r2 = await runTrendGap(s.deps as never)
    expect(r2.gaps.filter((g) => g.outcome === 'ingested')).toHaveLength(1)
    expect(r2.gaps.filter((g) => g.outcome === 'skipped-daily-limit')).toHaveLength(2)
    expect(s.stored).toHaveLength(6)
    const dayKey = [...s.redis.kv.keys()].find((k) => k.startsWith('zaviya:trendgap:day:'))!
    expect(dayKey).toContain('2026-11-12')
    expect(s.redis.kv.get(dayKey)).toBe('6')
  })

  it('runs nothing when our own articles cannot be read', async () => {
    const s = setup({ trends: [{ query: 'pak u19 vs ban u19', traffic: 10_000 }], news: u19News })
    s.deps.payload.recentArticles = async () => {
      throw new Error('down')
    }
    const run = await runTrendGap(s.deps as never)
    expect(run.gaps).toHaveLength(0)
    expect(s.stored).toHaveLength(0)
  })

  it('logs when the search is unavailable', async () => {
    const s = setup({ trends: [{ query: 'pubg mobile 4.7', traffic: 20_000 }], news: u19News })
    s.deps.fetchFn = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
    const run = await runTrendGap(s.deps as never)
    expect(run.gaps[0]).toMatchObject({ outcome: 'search-failed' })
  })
})

describe('cap behaviour of a trend-gap story', () => {
  const triage: TriageResult = {
    pakistanRelevance: 0.9,
    newsworthiness: 0.9,
    sourceCredibility: 0.8,
    category: 'cricket',
    sensitivityFlags: [],
    isUpdateOfExisting: false,
    suggestedPriority: 'high',
    decision: 'publish',
    reason: 'ok',
  }
  const ctx = { maxTier: 2 as const, distinctSources: 2, settings: { dailyCaps: { articles: 40 } }, now: new Date('2026-11-12T08:00:00Z'), trendsHit: true }

  it('a normal story waits when the day is over its pace; a trend-gap story (quotaOverdue) publishes', () => {
    expect(applyTriageRules(triage, { ...ctx, articlesPublishedToday: 40 }).outcome).toBe('defer')
    expect(applyTriageRules(triage, { ...ctx, articlesPublishedToday: 40, quotaOverdue: true }).outcome).toBe('publish')
  })
  it('but never beyond the cap plus the 6 extra slots', () => {
    expect(applyTriageRules(triage, { ...ctx, articlesPublishedToday: 45, quotaOverdue: true }).outcome).toBe('publish')
    expect(applyTriageRules(triage, { ...ctx, articlesPublishedToday: 46, quotaOverdue: true }).outcome).toBe('defer')
  })
  it('the publish-time cap check lets it use the extra slots only', async () => {
    const at = (n: number) => ({ getSettings: async () => ({ dailyCaps: { articles: 40 }, articlesPublishedToday: n }) })
    const now = new Date('2026-11-12T08:00:00Z').getTime()
    expect(await dailyCapReached(at(40), now)).toBe(true)
    expect(await dailyCapReached(at(40), now, true)).toBe(false)
    expect(await dailyCapReached(at(45), now, true)).toBe(false)
    expect(await dailyCapReached(at(46), now, true)).toBe(true)
  })
})
