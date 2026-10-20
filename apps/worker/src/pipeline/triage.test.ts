import { describe, it, expect, vi } from 'vitest'
import { QuotaExhaustedError } from '@zaviya/llm'
import { processTriageJob } from './triage.js'

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
