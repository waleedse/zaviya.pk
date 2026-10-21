import { describe, it, expect, vi } from 'vitest'
import { decidePitch, hasFreshSource } from './pitch.js'
import { processPublishJob } from './publish.js'

const now = Date.parse('2026-10-17T12:00:00Z')
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()

describe('hasFreshSource', () => {
  it('needs one source from the last 18 hours', () => {
    expect(hasFreshSource([{ publishedAt: hoursAgo(1) }], now)).toBe(true)
    expect(hasFreshSource([{ publishedAt: '2026-04-03T00:00:00Z' }, { publishedAt: hoursAgo(17) }], now)).toBe(true)
    expect(hasFreshSource([{ publishedAt: hoursAgo(19) }], now)).toBe(false)
    expect(hasFreshSource([{}], now)).toBe(false)
  })
})

describe('processPublishJob with stale sources', () => {
  it('does not publish and rejects the cluster', async () => {
    const payload = {
      getCluster: vi.fn(async () => ({ items: [{ publishedAt: '2026-04-03T00:00:00Z' }], triage: {} })),
      postArticle: vi.fn(),
      patchCluster: vi.fn(async () => ({})),
    }
    const res = await processPublishJob(
      { clusterId: '9', write: { en: { bodyMarkdown: Array.from({ length: 120 }, (_, i) => `w${i}`).join(' '), whatItMeans: 'x' } } as never, qaScore: 1, priority: 'normal' },
      { payload: payload as never, socialQueue: { add: vi.fn() } as never },
    )
    expect(res).toBeNull()
    expect(payload.postArticle).not.toHaveBeenCalled()
    expect(payload.patchCluster).toHaveBeenCalledWith('9', expect.objectContaining({ status: 'rejected' }))
  })
})

describe('decidePitch with stale sources', () => {
  it('refuses to write a pitch whose sources are all old', async () => {
    const payload = {
      getCluster: vi.fn(async () => ({ items: [{ publishedAt: '2026-04-03T00:00:00Z' }], triage: { codeOutcome: 'pitch' } })),
      patchCluster: vi.fn(async () => ({})),
    }
    const writeQueue = { add: vi.fn() }
    const ok = await decidePitch('5', 'write', { payload: payload as never, writeQueue, redis: {} as never })
    expect(ok).toBe(false)
    expect(writeQueue.add).not.toHaveBeenCalled()
    expect(payload.patchCluster).toHaveBeenCalledWith('5', expect.objectContaining({ status: 'rejected' }))
  })
})
