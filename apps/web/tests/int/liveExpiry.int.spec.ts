import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { expireLive, lastLiveActivity } from '../../src/lib/article-flags'

const NOW = Date.parse('2026-10-26T12:00:00Z')
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString()

function fake(docs: unknown[]) {
  const update = vi.fn().mockResolvedValue({})
  const create = vi.fn().mockResolvedValue({})
  const find = vi.fn().mockResolvedValue({ docs })
  return { payload: { find, update, create } as unknown as Payload, update, create }
}

describe('live expiry (ZAV-214)', () => {
  it('uses the newest live update, else the publish time', () => {
    expect(lastLiveActivity({ publishedAt: h(10), updates: [{ at: h(5) }, { at: h(1) }] })).toBe(NOW - 3_600_000)
    expect(lastLiveActivity({ publishedAt: h(10), updates: [] })).toBe(NOW - 10 * 3_600_000)
    expect(lastLiveActivity({})).toBe(0)
  })

  it('clears isLive only on stale live stories, writing nothing else', async () => {
    const { payload, update } = fake([
      { id: 1759, publishedAt: h(20), updates: [] },
      { id: 1800, publishedAt: h(20), updates: [{ at: h(0.5) }] },
      { id: 1801, publishedAt: h(1), updates: [] },
      { id: 1779, publishedAt: h(9), updates: [{ at: h(6) }] },
    ])
    expect(await expireLive(payload, NOW)).toEqual([1759, 1779])
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[0][0]).toMatchObject({ id: 1759, locale: 'en', data: { isLive: false } })
    expect(Object.keys(update.mock.calls[0][0].data)).toEqual(['isLive'])
  })
})
