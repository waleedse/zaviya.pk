import { describe, expect, it, vi } from 'vitest'
import { HERO_BACKFILL_JOB, queueHeroBackfill } from './hero-backfill.js'
import type { PayloadClient } from '../payload-client.js'

function fakePayload(docs: unknown[]) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const payload = {
    request: vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body })
      return method === 'GET' ? { docs } : {}
    }),
  } as unknown as PayloadClient
  return { payload, calls }
}

const docs = [
  { id: 1, title: 'Real image', heroImage: { id: 10, isAiGenerated: true } },
  { id: 2, title: 'Text card', dek: 'Dek two', heroImage: { id: 11, isAiGenerated: false } },
  { id: 3, title: 'No image', heroImage: null },
]

describe('queueHeroBackfill', () => {
  it('takes only stories without a Gemini image offline and queues them', async () => {
    const { payload, calls } = fakePayload(docs)
    const add = vi.fn(async () => undefined)
    const res = await queueHeroBackfill(payload, { add } as never)
    expect(res.ids).toEqual(['2', '3'])
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => [c.path, c.body])).toEqual([
      ['/api/articles/2?locale=en', { _status: 'draft' }],
      ['/api/articles/3?locale=en', { _status: 'draft' }],
    ])
    expect(add).toHaveBeenCalledWith(HERO_BACKFILL_JOB, { articleId: '2', title: 'Text card', brief: 'Text card. Dek two' }, expect.anything())
  })

  it('changes nothing on a dry run', async () => {
    const { payload, calls } = fakePayload(docs)
    const add = vi.fn()
    const res = await queueHeroBackfill(payload, { add } as never, { dryRun: true })
    expect(res.ids).toEqual(['2', '3'])
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    expect(add).not.toHaveBeenCalled()
  })
})
