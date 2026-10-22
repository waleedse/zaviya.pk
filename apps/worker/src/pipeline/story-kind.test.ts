import { describe, expect, it, vi } from 'vitest'
import type { TriageResult } from '@zaviya/shared'
import { FOREIGN_FEATURE_REASON, opinionCue, OPINION_REASON, pageFromWrongOutlet, routeByStoryKind } from './story-kind.js'
import { enrichFromExtension } from './write.js'
import { processTriageJob } from './triage.js'

// The text that was read for cluster 10826 (article 1429): a Dawn editorial, published as Pakistan news
const DAWN_EDITORIAL =
  'THE Himalayan, Karakoram and Hindu Kush ranges are warming up two to three times faster than the global average. The recent glacier collapse along the Nepal-Tibet border was direct evidence that human-induced climate change is now triggering catastrophic glacial failures. Given its location, Pakistan faces the same risk as did Nepal, but at a much larger scale. Pakistan has thousands of glaciers — the largest ice reserves outside the poles. For Pakistan, glacial instability is a national security, economic and humanitarian issue.\n\nBeyond extreme weather, climate change will significantly impact Pakistan’s food and water security. Infrastructure risks are also mounting. It is clear that glacial collapse is a transboundary crisis. Pakistan must take a leading role regionally and domestically across a wide range of fronts.\n\nClimate-resilient infrastructure, flood-resistant housing, climate-smart agriculture, and watershed management in mountainous landscapes should be prioritised. As one of the most climate-vulnerable countries, Pakistan should advocate globally that financing for loss and damage is not charity; it is an obligation.\n\nThe Nepal-Tibet tragedy and Pakistan’s 2022 floods underline the need for historical polluters to pay the frontline states for adaptation and energy transition. With decisive action on adaptation, stronger regional cooperation and access to climate finance, Pakistan can significantly reduce the massive risk that it is currently facing.\n\n(Read from www.dawn.com)'

const NEWS_TEXT =
  'The National Emergency Operations Centre said on Tuesday that a child in Karachi East tested positive for wild poliovirus, officials told reporters. It is the first case in the city in nearly two years. A vaccination drive begins next week, according to the health department. The ministry added that parents should cooperate with teams.'

const dawn1429 = { title: 'Glacial collapse - Dawn', url: 'https://news.google.com/rss/articles/CBMi1429?oc=5', summary: 'Glacial collapse  Dawn', contentText: DAWN_EDITORIAL }
const nikkei1430 = { title: 'Pakistan warms to Russia with Sharif-Putin summit possible - Nikkei Asia', url: 'https://news.google.com/rss/articles/CBMi1430?oc=5', summary: '', contentText: DAWN_EDITORIAL }

const triage = (over: Partial<TriageResult> = {}): TriageResult => ({
  pakistanRelevance: 0.9,
  newsworthiness: 0.8,
  sourceCredibility: 0.8,
  category: 'pakistan',
  sensitivityFlags: [],
  isUpdateOfExisting: false,
  suggestedPriority: 'high',
  decision: 'publish',
  reason: 'x',
  ...over,
})

describe('opinionCue (ZAV-155)', () => {
  it('recognises the Dawn editorial behind article 1429 from its text alone', () => {
    expect(opinionCue([dawn1429])).toMatch(OPINION_REASON)
  })
  it('recognises opinion by URL section, headline label and writer bio', () => {
    expect(opinionCue([{ title: 'x', url: 'https://www.dawn.com/opinion/123/the-water-crisis' }])).toMatch(/URL/)
    expect(opinionCue([{ title: 'Opinion: Why the rupee will fall' }])).toMatch(/headline/)
    expect(opinionCue([{ title: 'The budget trap - Editorial' }])).toMatch(/headline/)
    expect(opinionCue([{ title: 'x', contentText: 'Some argument. The writer is a former diplomat and author of three books.' }])).toMatch(/bio/)
  })
  it('does not flag a news report, a short item or a headline-only item', () => {
    expect(opinionCue([{ title: 'Karachi East polio case - Dawn', contentText: NEWS_TEXT }])).toBeNull()
    expect(opinionCue([{ title: 'Rupee closes flat', contentText: 'Pakistan must act and should act and needs to act.' }])).toBeNull()
    expect(opinionCue([{ title: 'Glacial collapse - Dawn', url: 'https://news.google.com/rss/articles/x', summary: 'Glacial collapse  Dawn' }])).toBeNull()
  })
})

describe('routeByStoryKind (ZAV-155)', () => {
  it('rejects what the model calls opinion', () => {
    const v = routeByStoryKind(triage({ storyKind: 'opinion' }), [{ title: 'Glacial collapse - Dawn' }])
    expect(v).toEqual({ action: 'reject', reason: OPINION_REASON })
  })
  it('rejects opinion the model missed when the text shows it (1429)', () => {
    const v = routeByStoryKind(triage({ storyKind: 'news', eventRegion: 'abroad' }), [dawn1429])
    expect(v.action).toBe('reject')
  })
  it('rejects a feature about an event abroad without a Pakistan angle (1430 as the model would label it)', () => {
    const v = routeByStoryKind(triage({ storyKind: 'feature', eventRegion: 'abroad', pakistanRelevance: 0.45 }), [{ title: 'Glaciers are collapsing - Nikkei Asia' }])
    expect(v).toEqual({ action: 'reject', reason: FOREIGN_FEATURE_REASON })
  })
  it('moves a foreign-event feature with a real Pakistan angle, and any foreign event, out of the Pakistan section', () => {
    const feature = routeByStoryKind(triage({ storyKind: 'feature', eventRegion: 'abroad', pakistanRelevance: 0.7 }), [{ title: 'x' }])
    expect(feature).toMatchObject({ action: 'ok', triage: { category: 'world' } })
    const news = routeByStoryKind(triage({ storyKind: 'news', eventRegion: 'abroad' }), [{ title: 'x' }])
    expect(news).toMatchObject({ action: 'ok', triage: { category: 'world' } })
  })
  it('leaves Pakistan news, and desks other than Pakistan, alone', () => {
    expect(routeByStoryKind(triage({ storyKind: 'news', eventRegion: 'pakistan' }), [{ title: 'x', contentText: NEWS_TEXT }])).toMatchObject({ action: 'ok', triage: { category: 'pakistan' } })
    expect(routeByStoryKind(triage({ category: 'ai', eventRegion: 'abroad' }), [{ title: 'x' }])).toMatchObject({ action: 'ok', triage: { category: 'ai' } })
    expect(routeByStoryKind(triage(), [{ title: 'x' }])).toMatchObject({ action: 'ok', triage: { category: 'pakistan' } })
  })
})

describe('pageFromWrongOutlet (the 1430 mix-up)', () => {
  it('flags a Dawn page read for a Nikkei Asia headline, and accepts the matching outlet', () => {
    expect(pageFromWrongOutlet(nikkei1430.title, 'https://www.dawn.com/news/1950001')).toBe(true)
    expect(pageFromWrongOutlet('Glacial collapse - Dawn', 'https://www.dawn.com/news/1950001')).toBe(false)
    expect(pageFromWrongOutlet('Budget talks resume - The Express Tribune', 'https://tribune.com.pk/story/1')).toBe(false)
  })
  it('does not judge headlines without an outlet, or pages from outlets it does not know', () => {
    expect(pageFromWrongOutlet('Budget talks resume', 'https://www.dawn.com/news/1')).toBe(false)
    expect(pageFromWrongOutlet('Budget talks resume - Some Blog', 'https://someblog.example/post')).toBe(false)
  })
  it('enrichFromExtension drops the wrong page and saves the right one', async () => {
    const patchSourceItem = vi.fn()
    const payload = { patchSourceItem } as never
    const long = 'x'.repeat(400)
    const wrong = { send: vi.fn().mockResolvedValue({ url: 'https://www.dawn.com/news/1950001', title: 't', text: long }), isOnline: () => true }
    expect(await enrichFromExtension([{ id: '2', url: nikkei1430.url, title: nikkei1430.title }], payload, wrong, '10902')).toBe(false)
    expect(patchSourceItem).not.toHaveBeenCalled()
    const right = { send: vi.fn().mockResolvedValue({ url: 'https://www.dawn.com/news/1950001', title: 't', text: long }), isOnline: () => true }
    expect(await enrichFromExtension([{ id: '1', url: dawn1429.url, title: dawn1429.title }], payload, right, '10826')).toBe(true)
  })
})

describe('triage end to end for 1429 and 1430', () => {
  const run = async (items: unknown[], model: Partial<TriageResult>, extra: Record<string, unknown> = {}) => {
    const payload = {
      getCluster: vi.fn().mockResolvedValue({ id: '1', headline: 'h', items, maxTier: 2, distinctSources: 2 }),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn(),
      recentArticles: vi.fn().mockResolvedValue([]),
    }
    const writeQueue = { add: vi.fn() }
    const router = { chat: vi.fn().mockResolvedValue({ content: JSON.stringify(triage(model)) }) }
    await processTriageJob({ clusterId: '1' }, { router, payload, writeQueue, ...extra } as never)
    return { payload, writeQueue }
  }
  const fresh = (it: object) => ({ ...it, publishedAt: new Date().toISOString(), source: { name: 'Dawn (via Google News)', trustTier: 2 } })

  it('1429: the Dawn editorial is rejected, not written', async () => {
    const r = await run([fresh(dawn1429)], { storyKind: 'news', eventRegion: 'abroad' })
    expect(r.writeQueue.add).not.toHaveBeenCalled()
    const last = r.payload.patchCluster.mock.calls.at(-1)![1]
    expect(last).toMatchObject({ status: 'rejected', triage: { codeOutcome: 'reject' } })
    expect(last.triage.deferReason).toMatch(/opinion|commentary/)
  })
  it('1430: a foreign feature the model labels is rejected, or routed to World with a Pakistan angle', async () => {
    const headlineOnly = fresh({ ...nikkei1430, contentText: undefined })
    const rejected = await run([headlineOnly], { storyKind: 'feature', eventRegion: 'abroad', pakistanRelevance: 0.5 })
    expect(rejected.writeQueue.add).not.toHaveBeenCalled()
    expect(rejected.payload.patchCluster.mock.calls.at(-1)![1].triage.deferReason).toBe(FOREIGN_FEATURE_REASON)
    const routed = await run([headlineOnly], { storyKind: 'feature', eventRegion: 'abroad', pakistanRelevance: 0.75, newsworthiness: 0.9, sourceCredibility: 0.9 })
    expect(routed.writeQueue.add).toHaveBeenCalledTimes(1)
    expect(routed.writeQueue.add.mock.calls[0]![1].triage.category).toBe('world')
  })
  it('an editorial found only after the extension read it is rejected before it is pitched', async () => {
    const thin = fresh({ id: '9', title: 'Glacial collapse - Dawn', url: 'https://news.google.com/rss/articles/x', summary: 'Glacial collapse  Dawn' })
    const read = fresh({ ...thin, contentText: DAWN_EDITORIAL })
    const payload = {
      getCluster: vi.fn().mockResolvedValueOnce({ id: '1', items: [thin], maxTier: 2, distinctSources: 2 }).mockResolvedValue({ id: '1', items: [read], maxTier: 2, distinctSources: 2 }),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn(),
      patchSourceItem: vi.fn(),
      recentArticles: vi.fn().mockResolvedValue([]),
    }
    const bridge = { isOnline: () => true, send: vi.fn().mockResolvedValue({ url: 'https://www.dawn.com/news/1', title: 't', text: DAWN_EDITORIAL }) }
    const router = { chat: vi.fn().mockResolvedValue({ content: JSON.stringify(triage({ storyKind: 'news', eventRegion: 'pakistan' })) }) }
    await processTriageJob({ clusterId: '1' }, { router, payload, writeQueue: { add: vi.fn() }, pitch: true, bridge } as never)
    const last = payload.patchCluster.mock.calls.at(-1)![1]
    expect(last.status).toBe('rejected')
    expect(payload.patchCluster.mock.calls.some((c) => c[1].triage?.codeOutcome === 'pitch')).toBe(false)
  })
})
