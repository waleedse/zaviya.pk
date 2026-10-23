import { describe, it, expect, vi } from 'vitest'
import { InputBlockedError, QuotaExhaustedError } from '@zaviya/llm'
import { DEFER_RELEASE_MIN, HEADLINE_ONLY_REJECT, HEADLINE_ONLY_RETRY_MIN, HEADLINE_ONLY_WAITING, LONELY_TRIAGE_MIN, processTriageJob, releaseDeferredClusters, releaseStuckNewClusters } from './triage.js'

describe('processTriageJob', () => {
  it('requeues the cluster with a delay when LLM quota is exhausted', async () => {
    const add = vi.fn()
    const router = { chat: vi.fn().mockRejectedValue(new QuotaExhaustedError(Date.now() + 10 * 60_000)) }
    const payload = {
      getCluster: vi.fn().mockResolvedValue({ id: '1', items: [], maxTier: 2, distinctSources: 2 }),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn(),
    }
    await processTriageJob({ clusterId: '1' }, { router, payload, writeQueue: {}, triageQueue: { add } } as never)
    expect(add).toHaveBeenCalledTimes(1)
    const [, data, opts] = add.mock.calls[0]
    expect(data).toEqual({ clusterId: '1' })
    expect(opts.delay).toBeGreaterThan(9 * 60_000)
    expect(payload.patchCluster).not.toHaveBeenCalled()
  })

  it('rejects the cluster with a reason when the model blocks the input, instead of leaving it new (ZAV-182)', async () => {
    const add = vi.fn()
    const router = { chat: vi.fn().mockRejectedValue(new InputBlockedError('gemma-4-26b-a4b-it', 'sensitive words')) }
    const payload = {
      getCluster: vi.fn().mockResolvedValue({ id: '5', items: [], maxTier: 2, distinctSources: 2 }),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn(),
    }
    await processTriageJob({ clusterId: '5' }, { router, payload, writeQueue: {}, triageQueue: { add } } as never)
    expect(add).not.toHaveBeenCalled()
    expect(payload.patchCluster).toHaveBeenCalledWith('5', {
      status: 'rejected',
      triage: expect.objectContaining({ codeOutcome: 'reject', deferReason: expect.stringContaining('model blocked the input') }),
    })
  })

  it('retries once with a smaller prompt when the reply is truncated JSON (ZAV-21)', async () => {
    const good = JSON.stringify({ pakistanRelevance: 0.9, newsworthiness: 0.9, sourceCredibility: 0.9, category: 'pakistan', sensitivityFlags: [], isUpdateOfExisting: false, suggestedPriority: 'normal', decision: 'publish', reason: 'fresh' })
    const chat = vi.fn().mockResolvedValueOnce({ content: '{"reason":"unterminated' }).mockResolvedValueOnce({ content: good })
    const items = Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, contentText: 'x'.repeat(900), source: { name: 'Dawn', trustTier: 1 } }))
    const payload = {
      getCluster: vi.fn().mockResolvedValue({ id: '2', items, maxTier: 1, distinctSources: 2 }),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn(),
      recentArticles: vi.fn().mockResolvedValue([]),
    }
    await processTriageJob({ clusterId: '2' }, { router: { chat }, payload, writeQueue: { add: vi.fn() } } as never)
    expect(chat).toHaveBeenCalledTimes(2)
    expect(chat.mock.calls[0]![1].maxTokens).toBe(2048)
    const second = chat.mock.calls[1]![1].messages[1].content as string
    expect(second.match(/<source id=/g)).toHaveLength(3)
    expect(payload.patchCluster).toHaveBeenCalled()
  })

  const triageJson = {
    pakistanRelevance: 0.9,
    newsworthiness: 0.9,
    sourceCredibility: 0.9,
    category: 'pakistan',
    sensitivityFlags: [],
    isUpdateOfExisting: false,
    suggestedPriority: 'normal',
    decision: 'publish',
    reason: 'fresh',
  }
  const polioCluster = {
    id: '9409',
    headline: 'Vaccination urgency grows as Karachi East logs first polio case',
    items: [{ title: 'Karachi East polio case: NEOC confirms - Dawn', publishedAt: new Date().toISOString(), source: { name: 'Dawn', trustTier: 1 } }],
    maxTier: 1,
    distinctSources: 2,
  }
  const setup = (recent: unknown[]) => {
    const router = { chat: vi.fn().mockResolvedValue({ content: JSON.stringify(triageJson) }) }
    const payload = {
      getCluster: vi.fn().mockResolvedValue(polioCluster),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn(),
      recentArticles: vi.fn().mockResolvedValue(recent),
    }
    const writeQueue = { add: vi.fn() }
    return { router, payload, writeQueue }
  }
  const polio1290 = { id: '1290', title: 'Karachi Polio Case Is First in Nearly Two Years; Tally Hits 7', publishedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), published: true, lastUpdateAt: null }

  it('routes a cluster about an event we already published to an update of that article (ZAV-134)', async () => {
    const d = setup([polio1290])
    await processTriageJob({ clusterId: '9409' }, d as never)
    expect(d.writeQueue.add).toHaveBeenCalledTimes(1)
    const job = d.writeQueue.add.mock.calls[0]![1]
    expect(job.triage.isUpdateOfExisting).toBe(true)
    expect(job.triage.existingArticleId).toBe('1290')
  })

  it('does not write a second article when the first was updated under 2h ago', async () => {
    const d = setup([{ ...polio1290, lastUpdateAt: new Date(Date.now() - 30 * 60_000).toISOString() }])
    await processTriageJob({ clusterId: '9409' }, d as never)
    expect(d.writeQueue.add).not.toHaveBeenCalled()
    const last = d.payload.patchCluster.mock.calls.at(-1)!
    expect(last[1].status).toBe('rejected')
    expect(last[1].triage.deferReason).toMatch(/same story as article 1290/)
  })

  it('pitches with the lede read through the extension for a headline-only Dawn item (ZAV-149)', async () => {
    const d = setup([])
    const cluster = { ...polioCluster, items: [{ id: '55', url: 'https://www.dawn.com/news/1', title: 'Karachi East polio case: NEOC confirms - Dawn', summary: 'Karachi East polio case: NEOC confirms - Dawn', publishedAt: new Date().toISOString(), source: { name: 'Google News', trustTier: 1 } }] }
    const read = { ...cluster, items: [{ ...cluster.items[0]!, contentText: 'The National Emergency Operations Centre confirmed on Tuesday that a child in Karachi East tested positive for wild poliovirus. It is the first case in the city in nearly two years. Officials said a vaccination drive begins next week. More follows.' }] }
    d.payload.getCluster.mockResolvedValueOnce(cluster).mockResolvedValue(read)
    const patchSourceItem = vi.fn()
    ;(d.payload as Record<string, unknown>).patchSourceItem = patchSourceItem
    const page = { url: 'https://www.dawn.com/news/1', title: 't', text: 'x'.repeat(400) }
    const bridge = { isOnline: () => true, send: vi.fn().mockResolvedValue(page) }
    await processTriageJob({ clusterId: '9409' }, { ...d, pitch: true, bridge } as never)
    expect(bridge.send).toHaveBeenCalledTimes(1)
    expect(patchSourceItem).toHaveBeenCalledWith('55', expect.objectContaining({ contentText: expect.stringContaining('xxxx') }))
    const last = d.payload.patchCluster.mock.calls.at(-1)![1]
    expect(last.triage.codeOutcome).toBe('pitch')
    expect(last.triage.pitchSummary).toMatch(/^The National Emergency Operations Centre confirmed.*two years\.$/)
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('waits, instead of binning the story, when the extension is offline and the source is fresh (ZAV-163)', async () => {
    const d = setup([])
    const triageQueue = { add: vi.fn() }
    await processTriageJob({ clusterId: '9409' }, { ...d, triageQueue, pitch: true, bridge: { isOnline: () => false, send: vi.fn() } } as never)
    const last = d.payload.patchCluster.mock.calls.at(-1)![1]
    expect(last.status).toBe('triaged')
    expect(last.triage).toMatchObject({ codeOutcome: 'defer', deferReason: HEADLINE_ONLY_WAITING })
    expect(triageQueue.add).toHaveBeenCalledTimes(1)
    expect(triageQueue.add.mock.calls[0]![2].delay).toBe(HEADLINE_ONLY_RETRY_MIN * 60_000)
  })

  // The four pitches of 22 Oct 01:24 PKT: empty pitchSummary, a Google News link as the only source
  const headlineOnly: [string, string, string, string][] = [
    ['11140', 'Rice exporters seek relief on rail freight - Arab News PK', 'Arab News PK', 'https://news.google.com/rss/articles/CBMi11140?oc=5'],
    ['11150', 'Cotton arrivals rise 12pc to 4.4m bales - Mettis Global', 'Mettis Global', 'https://news.google.com/rss/articles/CBMi11150?oc=5'],
    ['11161', 'SECP issues PRL rules for listed companies - Investify', 'Investify', 'https://news.google.com/rss/articles/CBMi11161?oc=5'],
    ['11173', 'Sheikhupura maid case: suspects arrested - ARY News', 'ARY News', 'https://news.google.com/rss/articles/CBMi11173?oc=5'],
  ]
  it.each(headlineOnly)('rejects headline-only pitch %s when the article body cannot be read (ZAV-163)', async (id, title, outlet, url) => {
    const d = setup([])
    const item = { id: '1', url, title, summary: title.replace(' - ', '  '), publishedAt: new Date().toISOString(), source: { name: `Google News — ${outlet}`, trustTier: 2 } }
    d.payload.getCluster.mockResolvedValue({ ...polioCluster, id, headline: title, items: [item] })
    // extension online but the page read fails
    const bridge = { isOnline: () => true, send: vi.fn().mockRejectedValue(new Error('tab closed')) }
    await processTriageJob({ clusterId: id }, { ...d, pitch: true, bridge, triageQueue: { add: vi.fn() } } as never)
    const last = d.payload.patchCluster.mock.calls.at(-1)![1]
    expect(last.status).toBe('rejected')
    expect(last.triage).toMatchObject({ codeOutcome: 'reject', deferReason: HEADLINE_ONLY_REJECT })
    expect(d.writeQueue.add).not.toHaveBeenCalled()
    expect(d.payload.patchCluster.mock.calls.some((c) => c[1].triage?.codeOutcome === 'pitch')).toBe(false)
  })

  it('rejects a headline-only pitch outright once the sources are old, even with the extension offline', async () => {
    const d = setup([])
    const old = { ...polioCluster, items: [{ ...polioCluster.items[0]!, publishedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), summary: '' }] }
    d.payload.getCluster.mockResolvedValue(old)
    await processTriageJob({ clusterId: '9409' }, { ...d, pitch: true, bridge: { isOnline: () => false, send: vi.fn() }, triageQueue: { add: vi.fn() } } as never)
    expect(d.payload.patchCluster.mock.calls.at(-1)![1].status).toBe('rejected')
  })

  it('still pitches a story that has a body', async () => {
    const d = setup([])
    const body = 'The National Emergency Operations Centre confirmed on Tuesday that a child in Karachi East tested positive for wild poliovirus. It is the first case in the city.'
    d.payload.getCluster.mockResolvedValue({ ...polioCluster, items: [{ ...polioCluster.items[0]!, contentText: body }] })
    await processTriageJob({ clusterId: '9409' }, { ...d, pitch: true, bridge: { isOnline: () => false, send: vi.fn() } } as never)
    expect(d.payload.patchCluster.mock.calls.at(-1)![1].triage).toMatchObject({ codeOutcome: 'pitch' })
  })

  it('writes normally when no recent article matches or the lookup fails', async () => {
    const none = setup([{ ...polio1290, title: 'Rupee closes flat in interbank trading' }])
    await processTriageJob({ clusterId: '9409' }, none as never)
    expect(none.writeQueue.add.mock.calls[0]![1].triage.isUpdateOfExisting).toBe(false)
    const broken = setup([])
    broken.payload.recentArticles.mockRejectedValue(new Error('boom'))
    await processTriageJob({ clusterId: '9409' }, broken as never)
    expect(broken.writeQueue.add).toHaveBeenCalledTimes(1)
  })
})

describe('releaseDeferredClusters (ZAV-144)', () => {
  const T = Date.parse('2026-10-20T10:00:00Z')
  it('asks for clusters idle for the release time and queues each once per 15-minute slot', async () => {
    const deferredClusters = vi.fn().mockResolvedValue({ clusters: [{ id: '9548', updatedAt: 'x', reason: 'Minimum interval 15m not met since last publish' }, { id: '9706', updatedAt: 'x', reason: '' }] })
    const add = vi.fn()
    const n = await releaseDeferredClusters({ payload: { deferredClusters }, triageQueue: { add } }, T + 15 * 60_000)
    expect(deferredClusters).toHaveBeenCalledWith(DEFER_RELEASE_MIN)
    expect(n).toBe(2)
    expect(add).toHaveBeenCalledTimes(2)
    expect(add.mock.calls[0]![1]).toEqual({ clusterId: '9548' })
    // same cluster in the same slot gets the same job id (BullMQ drops the duplicate); the next slot a new one
    const id = (t: number) => {
      const a = vi.fn()
      return releaseDeferredClusters({ payload: { deferredClusters }, triageQueue: { add: a } }, t).then(() => a.mock.calls[0]![2].jobId as string)
    }
    expect(await id(T + 16 * 60_000)).toBe(await id(T + 20 * 60_000))
    expect(await id(T + 16 * 60_000)).not.toBe(await id(T + 31 * 60_000))
  })
  it('does nothing when nothing is deferred', async () => {
    const add = vi.fn()
    expect(await releaseDeferredClusters({ payload: { deferredClusters: vi.fn().mockResolvedValue({ clusters: [] }) }, triageQueue: { add } })).toBe(0)
    expect(add).not.toHaveBeenCalled()
  })
})

describe('a deferred cluster once the interval has passed (ZAV-144)', () => {
  const good = JSON.stringify({ pakistanRelevance: 0.9, newsworthiness: 0.9, sourceCredibility: 0.9, category: 'pakistan', sensitivityFlags: [], isUpdateOfExisting: false, suggestedPriority: 'normal', decision: 'publish', reason: 'fresh' })
  const run = async (lastPublishedMinAgo: number, items: unknown[] = [{ title: 'x', publishedAt: new Date().toISOString(), source: { name: 'ARY', trustTier: 1 } }]) => {
    const payload = {
      getCluster: vi.fn().mockResolvedValue({ id: '9548', headline: 'Saudi health jobs', items, maxTier: 1, distinctSources: 2 }),
      getSettings: vi.fn().mockResolvedValue({ lastPublishedAt: new Date(Date.now() - lastPublishedMinAgo * 60_000).toISOString() }),
      patchCluster: vi.fn(),
      recentArticles: vi.fn().mockResolvedValue([]),
    }
    const triageQueue = { add: vi.fn() }
    const writeQueue = { add: vi.fn() }
    await processTriageJob({ clusterId: '9548' }, { router: { chat: vi.fn().mockResolvedValue({ content: good }) }, payload, writeQueue, triageQueue } as never)
    return { payload, triageQueue, writeQueue }
  }
  it('is deferred inside the interval, with a retry queued', async () => {
    const r = await run(3)
    expect(r.payload.patchCluster.mock.calls[0]![1].triage.codeOutcome).toBe('defer')
    expect(r.triageQueue.add).toHaveBeenCalledTimes(1)
  })
  it('keeps deferring when the cluster holds an old first item but a fresh source (ZAV-179)', async () => {
    const old = new Date(Date.now() - 30 * 3_600_000).toISOString()
    const r = await run(3, [{ title: 'old', publishedAt: old, source: { name: 'X', trustTier: 2 } }, { title: 'APP', publishedAt: new Date().toISOString(), source: { name: 'APP', trustTier: 1 } }])
    expect(r.payload.patchCluster.mock.calls[0]![1].status).toBe('triaged')
    expect(r.payload.patchCluster.mock.calls[0]![1].triage.codeOutcome).toBe('defer')
    expect(r.triageQueue.add).toHaveBeenCalledTimes(1)
  })
  it('closes a deferred cluster only when every source is stale, and says so', async () => {
    const old = new Date(Date.now() - 30 * 3_600_000).toISOString()
    const r = await run(3, [{ title: 'old', publishedAt: old, source: { name: 'X', trustTier: 1 } }])
    const patch = r.payload.patchCluster.mock.calls[0]![1]
    expect(patch.status).toBe('rejected')
    expect(patch.triage.deferReason).toMatch(/^stale sources/)
  })
  it('is not deferred after 15 minutes', async () => {
    const r = await run(16)
    expect(r.payload.patchCluster.mock.calls[0]![1].triage.codeOutcome).not.toBe('defer')
    expect(r.triageQueue.add).not.toHaveBeenCalled()
  })
})

describe('releaseStuckNewClusters (ZAV-147)', () => {
  const T = Date.parse('2026-10-21T10:00:00Z')
  it('queues every stuck new cluster once per 15-minute slot', async () => {
    const stuckNewClusters = vi.fn().mockResolvedValue({ clusters: [{ id: '9728', updatedAt: 'x', distinctSources: 1 }, { id: '10538', updatedAt: 'x', distinctSources: 3 }] })
    const add = vi.fn()
    const n = await releaseStuckNewClusters({ payload: { stuckNewClusters }, triageQueue: { add }, minSources: 2 }, T)
    expect(stuckNewClusters).toHaveBeenCalledWith(DEFER_RELEASE_MIN, LONELY_TRIAGE_MIN, 2)
    expect(n).toBe(2)
    expect(add.mock.calls[0]![1]).toEqual({ clusterId: '9728' })
    const id = (t: number) => {
      const a = vi.fn()
      return releaseStuckNewClusters({ payload: { stuckNewClusters }, triageQueue: { add: a } }, t).then(() => a.mock.calls[0]![2].jobId as string)
    }
    expect(await id(T + 60_000)).toBe(await id(T + 5 * 60_000))
    expect(await id(T)).not.toBe(await id(T + 16 * 60_000))
  })
  it('does nothing when no cluster is stuck', async () => {
    const add = vi.fn()
    expect(await releaseStuckNewClusters({ payload: { stuckNewClusters: vi.fn().mockResolvedValue({ clusters: [] }) }, triageQueue: { add } })).toBe(0)
    expect(add).not.toHaveBeenCalled()
  })
})
