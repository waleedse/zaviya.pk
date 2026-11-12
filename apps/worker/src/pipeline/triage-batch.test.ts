import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QuotaExhaustedError, InputBlockedError } from '@zaviya/llm'
import { TriageBatcher, triageBatchUserPrompt } from './triage-batch.js'
import { prefilterReject } from './triage-prefilter.js'
import { jitter, processTriageJob, LONELY_TRIAGE_MIN } from './triage.js'
import { geminiReportLine } from './learning.js'

const verdict = (clusterId: string, extra = {}) => ({
  clusterId, pakistanRelevance: 0.9, newsworthiness: 0.9, sourceCredibility: 0.9, category: 'pakistan', sensitivityFlags: [],
  isUpdateOfExisting: false, suggestedPriority: 'normal', decision: 'publish', reason: 'fresh', ...extra,
})
const cl = (id: string) => ({ id, headline: `h${id}`, itemCount: 1, distinctSources: 2, maxTier: 1, items: [{ title: `t${id}`, source: { name: 'Dawn', trustTier: 1 } }] })

describe('TriageBatcher', () => {
  beforeEach(() => void vi.useFakeTimers())
  afterEach(() => void vi.useRealTimers())

  it('scores 8 clusters in ONE call as soon as the batch is full', async () => {
    const chat = vi.fn().mockResolvedValue({ content: JSON.stringify({ results: Array.from({ length: 8 }, (_, i) => verdict(String(i))) }) })
    const b = new TriageBatcher({ chat } as never, { max: 8 })
    const all = await Promise.all(Array.from({ length: 8 }, (_, i) => b.score(cl(String(i)))))
    expect(chat).toHaveBeenCalledTimes(1)
    expect(all.every((r) => r?.decision === 'publish')).toBe(true)
    const prompt = chat.mock.calls[0]![1].messages[1].content as string
    expect(prompt.match(/<cluster id=/g)).toHaveLength(8)
    expect(chat.mock.calls[0]![1].format).toBeDefined()
  })

  it('flushes a partial batch after the window, and a lone cluster is left to the single-cluster path', async () => {
    const chat = vi.fn().mockResolvedValue({ content: JSON.stringify({ results: [verdict('a'), verdict('b')] }) })
    const b = new TriageBatcher({ chat } as never, { windowMs: 5000 })
    const two = Promise.all([b.score(cl('a')), b.score(cl('b'))])
    await vi.advanceTimersByTimeAsync(5000)
    expect((await two).map((r) => r?.decision)).toEqual(['publish', 'publish'])
    expect(chat).toHaveBeenCalledTimes(1)
    const one = b.score(cl('c'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(await one).toBeNull()
    expect(chat).toHaveBeenCalledTimes(1)
  })

  it('returns null for a cluster whose entry is missing, invalid or loops, so only that one is asked again', async () => {
    const loop = `Fine. ${'ability to '.repeat(30)}`
    const chat = vi.fn().mockResolvedValue({ content: JSON.stringify({ results: [verdict('a'), verdict('b', { newsworthiness: 7 }), verdict('c', { reason: loop })] }) })
    const b = new TriageBatcher({ chat } as never, { max: 4, windowMs: 100 })
    const p = Promise.all(['a', 'b', 'c', 'd'].map((id) => b.score(cl(id))))
    await vi.advanceTimersByTimeAsync(100)
    expect((await p).map((r) => r?.decision ?? null)).toEqual(['publish', null, null, null])
  })

  it('reads a reply wrapped in a code fence (gemma adds a trailing ``` fence)', async () => {
    const body = JSON.stringify({ results: [verdict('a'), verdict('b')] })
    const chat = vi.fn().mockResolvedValue({ content: `\`\`\`json\n${body}\n\`\`\`` })
    const b = new TriageBatcher({ chat } as never, { max: 2 })
    expect((await Promise.all([b.score(cl('a')), b.score(cl('b'))])).map((r) => r?.decision)).toEqual(['publish', 'publish'])
    const chat2 = vi.fn().mockResolvedValue({ content: `${body}\n\`\`\`` })
    const b2 = new TriageBatcher({ chat: chat2 } as never, { max: 2 })
    expect((await Promise.all([b2.score(cl('a')), b2.score(cl('b'))])).map((r) => r?.decision)).toEqual(['publish', 'publish'])
  })

  it('falls back to single calls when the reply is not JSON or the model refuses the batch text', async () => {
    const chat = vi.fn().mockResolvedValueOnce({ content: 'nope' }).mockRejectedValueOnce(new InputBlockedError('m', 'sensitive words'))
    const b = new TriageBatcher({ chat } as never, { max: 2 })
    expect(await Promise.all([b.score(cl('a')), b.score(cl('b'))])).toEqual([null, null])
    expect(await Promise.all([b.score(cl('a')), b.score(cl('b'))])).toEqual([null, null])
  })

  it('hands a quota error to every job in the batch', async () => {
    const chat = vi.fn().mockRejectedValue(new QuotaExhaustedError(Date.now() + 600_000))
    const b = new TriageBatcher({ chat } as never, { max: 2 })
    const r = await Promise.allSettled([b.score(cl('a')), b.score(cl('b'))])
    expect(r.map((x) => x.status)).toEqual(['rejected', 'rejected'])
  })

  it('builds one block per cluster', () => {
    expect(triageBatchUserPrompt([cl('1'), cl('2')])).toContain('<cluster id="2">')
  })
})

describe('prefilterReject', () => {
  const now = Date.parse('2026-11-12T12:00:00Z')
  const fresh = '2026-11-12T10:00:00Z'
  const old = '2026-11-10T10:00:00Z'
  it('closes stale, scorecard-only and opinion clusters, never a trending one', () => {
    expect(prefilterReject({ items: [{ title: 'x', publishedAt: old }] }, { trending: false, now })).toMatch(/stale/)
    expect(prefilterReject({ items: [{ title: 'x', publishedAt: old }] }, { trending: true, now })).toBeNull()
    expect(prefilterReject({ items: [{ title: 'x', publishedAt: fresh }] }, { trending: false, now })).toBeNull()
    expect(prefilterReject({ items: [{ title: 'x' }] }, { trending: false, now })).toBeNull() // undated: left to triage
    expect(prefilterReject({ headline: 'PAK v BAN scorecard', items: [{ title: 'Live score: PAK v BAN', publishedAt: fresh }] }, { trending: false, now })).toMatch(/low value/)
    expect(prefilterReject({ headline: 'PAK v BAN scorecard', items: [{ title: 'Pakistan win', publishedAt: fresh }] }, { trending: false, now })).toBeNull()
  })
})

describe('processTriageJob with the batcher and the prefilter (ZG-22)', () => {
  const mk = (items: unknown[], over = {}) => ({
    getCluster: vi.fn().mockResolvedValue({ id: '1', headline: 'Budget passed', items, maxTier: 1, distinctSources: 3, itemCount: items.length, ...over }),
    getSettings: vi.fn().mockResolvedValue({}),
    patchCluster: vi.fn(),
    recentArticles: vi.fn().mockResolvedValue([]),
  })
  const item = (summary?: string, source = 'Dawn') => ({ title: 'Budget passed', summary, contentText: 'x'.repeat(900), source: { name: source, trustTier: 1 }, publishedAt: new Date().toISOString() })

  it('closes a stale cluster by rule: no model call at all', async () => {
    const chat = vi.fn()
    const payload = mk([{ ...item(), publishedAt: '2020-01-01T00:00:00Z' }])
    await processTriageJob({ clusterId: '1' }, { router: { chat }, payload, writeQueue: { add: vi.fn() } } as never)
    expect(chat).not.toHaveBeenCalled()
    expect(payload.patchCluster).toHaveBeenCalledWith('1', { status: 'rejected', triage: expect.objectContaining({ codeOutcome: 'reject', deferReason: expect.stringContaining('no model call') }) })
  })

  it('uses the batch verdict for a normal cluster and asks the single-cluster path for a trending one', async () => {
    const batcher = { score: vi.fn().mockResolvedValue(null) }
    const single = JSON.stringify({ ...verdict('1'), clusterId: undefined })
    const chat = vi.fn().mockResolvedValue({ content: single })
    const normal = mk([item()])
    await processTriageJob({ clusterId: '1' }, { router: { chat }, payload: normal, writeQueue: { add: vi.fn() }, batcher } as never)
    expect(batcher.score).toHaveBeenCalledTimes(1) // returned null: this cluster was then asked on its own
    expect(chat).toHaveBeenCalledTimes(1)

    batcher.score.mockClear()
    chat.mockClear()
    const trending = mk([item('Trend gap: budget 2026')])
    await processTriageJob({ clusterId: '1' }, { router: { chat }, payload: trending, writeQueue: { add: vi.fn() }, batcher } as never)
    expect(batcher.score).not.toHaveBeenCalled()
    expect(chat.mock.calls[0]![1].urgent).toBe(true)

    const scored = { score: vi.fn().mockResolvedValue({ ...verdict('1'), clusterId: undefined }) }
    chat.mockClear()
    await processTriageJob({ clusterId: '1' }, { router: { chat }, payload: mk([item()]), writeQueue: { add: vi.fn() }, batcher: scored } as never)
    expect(chat).not.toHaveBeenCalled()
  })

  it('requeues with a jittered delay when the batch hits the quota', async () => {
    const add = vi.fn()
    const batcher = { score: vi.fn().mockRejectedValue(new QuotaExhaustedError(Date.now() + 10 * 60_000)) }
    await processTriageJob({ clusterId: '1' }, { router: { chat: vi.fn() }, payload: mk([item()]), writeQueue: {}, triageQueue: { add }, batcher } as never)
    expect(add.mock.calls[0]![2].delay).toBeGreaterThan(9 * 60_000)
  })

  it('jitter adds up to half the wait, at most 10 minutes', () => {
    for (let i = 0; i < 50; i++) {
      const d = jitter(60_000)
      expect(d).toBeGreaterThanOrEqual(60_000)
      expect(d).toBeLessThan(90_000)
    }
    expect(jitter(60 * 60_000)).toBeLessThan(70 * 60_000)
    expect(LONELY_TRIAGE_MIN).toBe(360)
  })
})

describe('geminiReportLine', () => {
  it('summarises calls, limits, headroom and tasks per model', () => {
    const line = geminiReportLine([{ model: 'gemma-4-26b-a4b-it', calls: 254, limits: { rpd: 1500 }, headroomPct: 83, byTask: { triage: 193, seo: 42 }, rateLimited: 19, recitation: 21 }])
    expect(line).toBe('Gemini today: 254 calls | gemma-4-26b-a4b-it 254/1500 (83% left; triage 193, seo 42) 19x 429, 21x recitation')
  })
})
