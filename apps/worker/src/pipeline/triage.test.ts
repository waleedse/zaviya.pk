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
})
