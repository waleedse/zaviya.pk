import { describe, expect, it, vi } from 'vitest'
import { NUDGE_AFTER_MS, NUDGE_MAX, PENDING_KEY, nudgeAction, nudgeTrendClusters, rememberPending } from './trend-gap-nudge.js'

const T = Date.parse('2026-11-12T11:00:00Z')

function setup(cluster: { status: string; article?: string | null; triage?: Record<string, unknown> | null }, opts: { hasJob?: boolean; itemCluster?: unknown } = {}) {
  const hash: Record<string, string> = {}
  const redis = {
    hset: vi.fn(async (_k: string, f: string, v: string) => ((hash[f] = v), 1)),
    hdel: vi.fn(async (_k: string, f: string) => (delete hash[f], 1)),
    hgetall: vi.fn(async () => ({ ...hash })),
  }
  const payload = {
    request: vi.fn().mockResolvedValue({ cluster: opts.itemCluster === undefined ? 34011 : opts.itemCluster }),
    getCluster: vi.fn().mockResolvedValue({ id: '34011', items: [], article: null, triage: null, ...cluster }),
    patchCluster: vi.fn().mockResolvedValue({ ok: true }),
  }
  const writeQueue = { add: vi.fn() }
  const triageQueue = { add: vi.fn() }
  const chain = [{ getJobs: vi.fn().mockResolvedValue(opts.hasJob ? [{ data: { clusterId: '34011' } }] : []) }]
  return { hash, redis, payload, writeQueue, triageQueue, chain }
}

const run = (d: ReturnType<typeof setup>, at = T + NUDGE_AFTER_MS + 1000) => nudgeTrendClusters({ ...d, now: () => at } as never)

describe('nudgeAction', () => {
  it('writing with no job needs a write; with a job it is left alone', () => {
    expect(nudgeAction({ status: 'writing', triage: null }, false)).toBe('write')
    expect(nudgeAction({ status: 'writing', triage: null }, true)).toBe('waiting')
  })
  it('new, or triaged without the trend mark, is triaged again; marked triaged waits', () => {
    expect(nudgeAction({ status: 'new', triage: null }, false)).toBe('triage')
    expect(nudgeAction({ status: 'triaged', triage: { codeOutcome: 'pitch' } }, false)).toBe('triage')
    expect(nudgeAction({ status: 'triaged', triage: { codeOutcome: 'pitch', trendGap: true } }, false)).toBe('waiting')
  })
  it('a story that has an article, or is closed, is done', () => {
    expect(nudgeAction({ status: 'writing', article: '3900', triage: null }, false)).toBe('done')
    expect(nudgeAction({ status: 'published', triage: null }, false)).toBe('done')
    expect(nudgeAction({ status: 'rejected', triage: null }, false)).toBe('done')
  })
})

describe('nudgeTrendClusters', () => {
  it('waits for the normal path first', async () => {
    const d = setup({ status: 'writing' })
    await rememberPending(d.redis as never, 'bangladesh vs pakistan', ['93944'], T)
    await run(d, T + 60_000)
    expect(d.payload.getCluster).not.toHaveBeenCalled()
  })

  it('re-queues write for a cluster stuck in writing with no job (cluster 34011), marked as a trend story', async () => {
    const d = setup({ status: 'writing', triage: { codeOutcome: 'publish', suggestedPriority: 'high' } })
    await rememberPending(d.redis as never, 'bangladesh vs pakistan', ['93944', '93945'], T)
    const out = await run(d)
    expect(out).toEqual([{ id: '34011', term: 'bangladesh vs pakistan', action: 'write' }])
    expect(d.payload.patchCluster).toHaveBeenCalledWith('34011', { status: 'writing', triage: { codeOutcome: 'publish', suggestedPriority: 'high', trendGap: true } })
    const [name, data, opts] = d.writeQueue.add.mock.calls[0]!
    expect(name).toBe('write')
    expect(data).toEqual({ clusterId: '34011' })
    expect(opts.priority).toBe(2)
    // two items, one cluster: one write job
    expect(d.writeQueue.add).toHaveBeenCalledTimes(1)
    expect(JSON.parse(d.hash['93944']!).nudges).toBe(1)
  })

  it('does not touch a cluster that has a job', async () => {
    const d = setup({ status: 'writing' }, { hasJob: true })
    await rememberPending(d.redis as never, 't', ['1'], T)
    await run(d)
    expect(d.writeQueue.add).not.toHaveBeenCalled()
    expect(d.payload.patchCluster).not.toHaveBeenCalled()
  })

  it('queues triage again for a cluster triaged earlier without the trend mark', async () => {
    const d = setup({ status: 'triaged', triage: { codeOutcome: 'pitch' } })
    await rememberPending(d.redis as never, 't', ['1'], T)
    await run(d)
    expect(d.triageQueue.add).toHaveBeenCalledWith('triage', { clusterId: '34011' }, expect.objectContaining({ priority: 2 }))
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('forgets a cluster once it has an article, and does not nudge twice within 10 minutes', async () => {
    const done = setup({ status: 'writing', article: '3900' })
    await rememberPending(done.redis as never, 't', ['1'], T)
    await run(done)
    expect(done.hash['1']).toBeUndefined()

    const d = setup({ status: 'writing' })
    await rememberPending(d.redis as never, 't', ['1'], T)
    await run(d)
    await run(d, T + NUDGE_AFTER_MS + 5 * 60_000)
    expect(d.writeQueue.add).toHaveBeenCalledTimes(1)
  })

  it('gives up after the nudge limit and after 8 hours', async () => {
    const d = setup({ status: 'writing' })
    d.hash['1'] = JSON.stringify({ term: 't', at: T, nudges: NUDGE_MAX, lastNudgeAt: T })
    await run(d, T + 60 * 60_000)
    expect(d.writeQueue.add).not.toHaveBeenCalled()
    expect(d.hash['1']).toBeUndefined()

    const old = setup({ status: 'writing' })
    old.hash['2'] = JSON.stringify({ term: 't', at: T, nudges: 0 })
    await run(old, T + 9 * 3600_000)
    expect(old.payload.request).not.toHaveBeenCalled()
    expect(old.hash['2']).toBeUndefined()
  })

  it('leaves an item whose embedding has not assigned a cluster yet', async () => {
    const d = setup({ status: 'writing' }, { itemCluster: null })
    await rememberPending(d.redis as never, 't', ['1'], T)
    const out = await run(d)
    expect(out[0]!.action).toBe('no-cluster')
    expect(d.hash['1']).toBeDefined()
    void PENDING_KEY
  })
})
