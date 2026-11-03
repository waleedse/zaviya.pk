import { beforeEach, describe, it, expect, vi } from 'vitest'
import { clearFeedCache, htmlToText, isTrendingCluster, parseFeedEntries, readFromPublisherFeed, recoverReadableText, sameStoryHeadlines, splitOutlet } from './readable.js'
import { processTriageJob, HEADLINE_ONLY_TRENDING_RETRY_MIN, HEADLINE_ONLY_WAITING } from './triage.js'
import { processWriteJob } from './write.js'

beforeEach(() => clearFeedCache())

const BODY = 'Iran said on Tuesday that its air defences shot down a US MQ-9 Reaper drone over the Strait of Hormuz, state media reported. The US military did not immediately comment on the claim. Tehran said the drone had entered its airspace without permission and warned of a response. '.repeat(2)

const dawnFeed = (title: string, body: string) => `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Dawn</title>
<item><title>${title}</title><link>https://www.dawn.com/news/2041999/iran-shoots-down-us-drone</link><description>${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</description></item></channel></rss>`

const feedFetch = (xml: string) => vi.fn().mockResolvedValue(new Response(xml, { status: 200 })) as unknown as typeof fetch

const gnewsItem = (over: Record<string, unknown> = {}) => ({
  id: '501',
  title: 'Iran shoots down US MQ-9 drone over Hormuz - Dawn',
  summary: 'Iran shoots down US MQ-9 drone over Hormuz  Dawn',
  url: 'https://news.google.com/rss/articles/CBMiABC?oc=5',
  publishedAt: new Date().toISOString(),
  source: { name: 'Dawn (via Google News)', trustTier: 2 as const },
  ...over,
})

describe('feed parsing (ZAV-301)', () => {
  it('turns the HTML body of a feed item into paragraphs, without embeds', () => {
    const text = htmlToText('<p>First &amp; second.</p><figure><iframe src="x"></iframe></figure><blockquote class="twitter-tweet"><p>tweet</p></blockquote><p>Third.</p>')
    expect(text).toBe('First & second.\n\nThird.')
  })

  it('reads title, link and body from an RSS item', async () => {
    const [e] = await parseFeedEntries(dawnFeed('Iran shoots down US MQ-9 drone over Hormuz', '<p>Body text here.</p>'))
    expect(e).toMatchObject({ title: 'Iran shoots down US MQ-9 drone over Hormuz', link: 'https://www.dawn.com/news/2041999/iran-shoots-down-us-drone', body: 'Body text here.' })
  })

  it('splits the outlet off a Google News headline', () => {
    expect(splitOutlet('Iran shoots down US MQ-9 drone over Hormuz - Dawn')).toEqual({ headline: 'Iran shoots down US MQ-9 drone over Hormuz', outlet: 'Dawn' })
    expect(splitOutlet('No outlet here')).toEqual({ headline: 'No outlet here', outlet: '' })
  })
})

describe('readFromPublisherFeed (ZAV-301)', () => {
  it("reads Dawn's full text from Dawn's own feed, whichever feed carries the headline", async () => {
    const fetchFn = feedFetch(dawnFeed('Iran shoots down US MQ-9 drone over Hormuz', `<p>${BODY}</p>`))
    const got = await readFromPublisherFeed(gnewsItem(), { payload: {} as never, fetchFn })
    expect(got?.host).toBe('dawn.com')
    expect(got?.text).toContain('MQ-9 Reaper drone')
  })

  it('fetches the page the feed links to when the feed has no body (ARY), but only if robots.txt allows it', async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>ARY</title><item><title>Binance reveals hackers used fake job interviews</title><link>https://arynews.tv/binance-reveals</link><description>Binance reveals hackers used fake job interviews</description></item></channel></rss>`
    const item = gnewsItem({ title: 'Binance reveals hackers used fake job interviews - ARY News', source: { name: 'ARY News (via Google News)', trustTier: 2 } })
    const fetchText = vi.fn().mockResolvedValue(BODY)
    const ok = await readFromPublisherFeed(item, { payload: {} as never, fetchFn: feedFetch(xml), fetchText, allowed: async () => true })
    expect(fetchText).toHaveBeenCalledWith('https://arynews.tv/binance-reveals')
    expect(ok?.host).toBe('arynews.tv')
    const blocked = await readFromPublisherFeed(item, { payload: {} as never, fetchFn: feedFetch(xml), fetchText: vi.fn(), allowed: async () => false })
    expect(blocked).toBeNull()
  })

  it('returns null for an outlet without a feed, a headline the feed does not carry, or a dead feed', async () => {
    expect(await readFromPublisherFeed(gnewsItem({ title: 'Kayo sport - Aaj', source: { name: 'Google News — Pakistan', trustTier: 2 } }), { payload: {} as never, fetchFn: feedFetch('<rss/>') })).toBeNull()
    expect(await readFromPublisherFeed(gnewsItem({ title: 'A totally different story about nothing - Dawn' }), { payload: {} as never, fetchFn: feedFetch(dawnFeed('Something else', `<p>${BODY}</p>`)) })).toBeNull()
    const dead = vi.fn().mockResolvedValue(new Response('no', { status: 403 })) as unknown as typeof fetch
    expect(await readFromPublisherFeed(gnewsItem(), { payload: {} as never, fetchFn: dead })).toBeNull()
  })
})

describe('sameStoryHeadlines (ZAV-301)', () => {
  it('matches the same event across outlets', () => {
    expect(sameStoryHeadlines('Iran shoots down US MQ-9 drone over Hormuz - Dawn', 'Iran says it shot down American drone near Strait of Hormuz')).toBe(true)
    expect(sameStoryHeadlines('Iran shoots down US MQ-9 drone over Hormuz - Dawn', 'Iran shoots down US drone over Strait of Hormuz, state media says')).toBe(true)
    expect(sameStoryHeadlines('Binance reveals hackers used fake job interviews, malicious code in $6-bn heist', 'Binance says hackers used fake job interviews and malicious code in $6bn heist')).toBe(true)
  })

  it('does not match a different event that shares the topic word', () => {
    expect(sameStoryHeadlines('Iran shoots down US MQ-9 drone over Hormuz - Dawn', 'Iran, US still far apart on deal as Qatar pushes mediation')).toBe(false)
    expect(sameStoryHeadlines('Trump says US will stop $4 billion funding to Israel', 'Trump says tariffs on China will rise next year')).toBe(false)
  })
})

describe('recoverReadableText (ZAV-301)', () => {
  it('saves the outlet feed text on the headline-only item', async () => {
    const patchSourceItem = vi.fn()
    const saved = await recoverReadableText({ id: '1', headline: 'x', items: [gnewsItem()] }, { payload: { patchSourceItem, readableItems: vi.fn(), attachItem: vi.fn() }, fetchFn: feedFetch(dawnFeed('Iran shoots down US MQ-9 drone over Hormuz', `<p>${BODY}</p>`)) })
    expect(saved).toBe(true)
    expect(patchSourceItem).toHaveBeenCalledWith('501', { contentText: expect.stringContaining('(Read from dawn.com through the outlet') })
  })

  it("falls back to another outlet's readable report of the same story and attaches it (at most one per outlet, never the cluster's own item)", async () => {
    const attachItem = vi.fn().mockResolvedValue({ ok: true, id: '9' })
    const readableItems = vi.fn().mockResolvedValue({
      items: [
        { id: '70', title: 'Iran shoots down US drone over Strait of Hormuz, state media says', url: 'https://bbc.com/x', clusterId: '55', publishedAt: new Date().toISOString(), chars: 3000, source: { id: '3', name: 'BBC World', trustTier: 2 } },
        { id: '71', title: 'Iran shoots down US drone over Hormuz strait - BBC', url: 'https://bbc.com/y', clusterId: '56', publishedAt: new Date().toISOString(), chars: 3000, source: { id: '3', name: 'BBC World', trustTier: 2 } },
        { id: '72', title: 'SBP keeps policy rate unchanged', url: 'https://x', clusterId: '57', publishedAt: new Date().toISOString(), chars: 3000, source: { id: '4', name: 'Business Recorder', trustTier: 2 } },
      ],
    })
    const saved = await recoverReadableText({ id: '1', headline: 'Iran shoots down US MQ-9 drone over Hormuz - Dawn', items: [gnewsItem({ source: { name: 'Google News — Pakistan', trustTier: 2 } })] }, { payload: { patchSourceItem: vi.fn(), readableItems, attachItem }, fetchFn: feedFetch('<rss/>') })
    expect(saved).toBe(true)
    expect(readableItems).toHaveBeenCalledWith(24)
    expect(attachItem).toHaveBeenCalledTimes(1)
    expect(attachItem).toHaveBeenCalledWith('1', '70')
  })

  it('does nothing when another item of the cluster is already readable, and never throws', async () => {
    const readableItems = vi.fn()
    const readable = { ...gnewsItem({ id: '502', title: 'Iran drone - BBC' }), contentText: BODY }
    expect(await recoverReadableText({ id: '1', items: [gnewsItem({ source: { name: 'Google News — Pakistan', trustTier: 2 } }), readable] }, { payload: { patchSourceItem: vi.fn(), readableItems, attachItem: vi.fn() }, fetchFn: feedFetch('<rss/>') })).toBe(false)
    expect(readableItems).not.toHaveBeenCalled()
    const broken = vi.fn().mockRejectedValue(new Error('500'))
    expect(await recoverReadableText({ id: '1', headline: 'Iran shoots down US MQ-9 drone over Hormuz', items: [gnewsItem({ source: { name: 'Google News — Pakistan', trustTier: 2 } })] }, { payload: { patchSourceItem: vi.fn(), readableItems: broken, attachItem: vi.fn() }, fetchFn: feedFetch('<rss/>') })).toBe(false)
  })

  it('trending means several outlets, a Google Trends hit or a major world story', () => {
    expect(isTrendingCluster({ distinctSources: 3, items: [] }, null)).toBe(true)
    expect(isTrendingCluster({ distinctSources: 1, items: [{ source: { name: 'Google Trends — Pakistan daily' } }] }, null)).toBe(true)
    expect(isTrendingCluster({ distinctSources: 1, items: [] }, 'us-iran')).toBe(true)
    expect(isTrendingCluster({ distinctSources: 2, items: [{ source: { name: 'Dawn' } }] }, null)).toBe(false)
  })
})

describe('triage with a headline-only trending story (ZAV-301)', () => {
  const verdict = {
    pakistanRelevance: 0.1,
    newsworthiness: 0.85,
    sourceCredibility: 0.85,
    category: 'world',
    sensitivityFlags: ['violence'],
    isUpdateOfExisting: false,
    suggestedPriority: 'normal',
    decision: 'reject',
    reason: 'no Pakistan angle',
    storyKind: 'news',
    eventRegion: 'abroad',
  }
  const thin = { id: '501', title: 'Iran shoots down US MQ-9 drone over Hormuz - Dawn', url: 'https://news.google.com/rss/articles/x', summary: 'Iran shoots down US MQ-9 drone over Hormuz  Dawn', publishedAt: new Date().toISOString(), source: { name: 'Dawn (via Google News)', trustTier: 2 } }
  const clusterOf = (items: unknown[]) => ({ id: '24300', headline: thin.title, items, maxTier: 2, distinctSources: 1 })
  const setup = () => {
    const payload = {
      getCluster: vi.fn().mockResolvedValue(clusterOf([thin])),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn(),
      recentArticles: vi.fn().mockResolvedValue([]),
    }
    return { router: { chat: vi.fn().mockResolvedValue({ content: JSON.stringify(verdict) }) }, payload, writeQueue: { add: vi.fn() }, triageQueue: { add: vi.fn() } }
  }

  it('is no longer rejected for a weak Pakistan angle: once the body is recovered it goes to the writer with the world-story tag, no pitch round and no editor gate', async () => {
    const d = setup()
    const read = clusterOf([{ ...thin, contentText: BODY }])
    d.payload.getCluster.mockResolvedValueOnce(clusterOf([thin])).mockResolvedValue(read)
    const recoverText = vi.fn().mockResolvedValue(true)
    await processTriageJob({ clusterId: '24300' }, { ...d, pitch: true, autoApprove: 'all', recoverText, bridge: { isOnline: () => false, send: vi.fn() } } as never)
    expect(recoverText).toHaveBeenCalledTimes(1)
    const last = d.payload.patchCluster.mock.calls.at(-1)![1]
    expect(last.status).toBe('writing')
    expect(last.triage).toMatchObject({ globalTopic: 'us-iran', codeOutcome: 'publish', editorApproved: true })
    expect(d.writeQueue.add).toHaveBeenCalledTimes(1)
    expect(d.writeQueue.add.mock.calls[0]![1].triage.editorApproved).toBe(true)
  })

  it('is retried every 20 minutes, not rejected, while nothing readable exists yet, even if the extension is online', async () => {
    const d = setup()
    const recoverText = vi.fn().mockResolvedValue(false)
    await processTriageJob({ clusterId: '24300' }, { ...d, pitch: true, autoApprove: 'all', recoverText, bridge: { isOnline: () => true, send: vi.fn().mockRejectedValue(new Error('tab closed')) } } as never)
    const last = d.payload.patchCluster.mock.calls.at(-1)![1]
    expect(last.status).toBe('triaged')
    expect(last.triage).toMatchObject({ codeOutcome: 'defer', deferReason: HEADLINE_ONLY_WAITING })
    expect(d.triageQueue.add.mock.calls[0]![2].delay).toBe(HEADLINE_ONLY_TRENDING_RETRY_MIN * 60_000)
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('still rejects a non-trending headline-only story once the retry window has passed', async () => {
    const d = setup()
    const stale = { ...thin, title: 'Mayor, opposition trade barbs over development - Dawn', summary: 'Mayor, opposition trade barbs over development  Dawn', publishedAt: new Date(Date.now() - 5 * 3_600_000).toISOString() }
    d.payload.getCluster.mockResolvedValue({ ...clusterOf([stale]), headline: stale.title })
    d.router.chat.mockResolvedValue({ content: JSON.stringify({ ...verdict, decision: 'publish', category: 'pakistan', pakistanRelevance: 0.9, sensitivityFlags: [], eventRegion: 'pakistan' }) })
    await processTriageJob({ clusterId: '24300' }, { ...d, pitch: true, recoverText: vi.fn().mockResolvedValue(false), bridge: { isOnline: () => false, send: vi.fn() } } as never)
    expect(d.payload.patchCluster.mock.calls.at(-1)![1].status).toBe('rejected')
  })
})

describe('the writer recovers text before it skips a headline-only cluster (ZAV-301)', () => {
  it('recovers, re-reads the cluster and does not skip', async () => {
    const thin = { id: '501', title: 'Iran shoots down US MQ-9 drone over Hormuz - Dawn', url: 'https://news.google.com/x', summary: '', publishedAt: new Date().toISOString(), source: { name: 'Dawn', trustTier: 2 } }
    const getCluster = vi.fn().mockResolvedValueOnce({ id: '1', headline: thin.title, items: [thin], triage: {} }).mockResolvedValue({ id: '1', headline: thin.title, items: [{ ...thin, contentText: 'x'.repeat(100) }], triage: {} })
    const patchCluster = vi.fn()
    const recoverText = vi.fn().mockResolvedValue(true)
    // the cluster is still thin after recovery (100 chars): the write is skipped as before, but the recovery ran first
    const r = await processWriteJob({ clusterId: '1' }, { router: {} as never, payload: { getCluster, patchCluster } as never, env: { MIN_SOURCE_CHARS: 500 } as never, recoverText })
    expect(recoverText).toHaveBeenCalledTimes(1)
    expect(getCluster).toHaveBeenCalledTimes(2)
    expect(r).toBeNull()
    expect(patchCluster).toHaveBeenCalledWith('1', { status: 'triaged' })
  })
})
