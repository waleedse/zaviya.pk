import { vi } from 'vitest'
import { memoryKv } from './kv.js'
import type { ExecDeps } from './execute.js'
import { parseSlots } from '../video/schedule.js'

/** Saturday 2026-10-17 10:00 Karachi: morning has run its render time, ai (tue/thu/sat 17:10) is due, money (mon-sat) due */
export const NOW = Date.UTC(2026, 9, 17, 5, 0)

export function makeExec(over: Partial<ExecDeps> = {}) {
  const kv = memoryKv(() => NOW)
  const payload = {
    retract: vi.fn().mockResolvedValue({ socialPosts: [{ id: '1', platform: 'x' }] }),
    setDailyCap: vi.fn().mockResolvedValue({ ok: true, dailyCaps: {} }),
    getSettings: vi.fn().mockResolvedValue({ articlesPublishedToday: 12, dailyCaps: { articles: 60 }, lastPublishedAt: '2026-10-17T04:30:00Z' }),
    request: vi.fn(async (_m: string, path: string): Promise<unknown> => {
      if (path.startsWith('/api/social-posts')) {
        return {
          docs: [
            { platform: 'x', status: 'posted' },
            { platform: 'x', status: 'failed', error: 'rate limit hit' },
            { platform: 'instagram', status: 'posted' },
          ],
        }
      }
      if (path.startsWith('/api/articles/')) return { id: 42, title: 'Budget passed' }
      if (path.startsWith('/api/articles?')) return { docs: [{ id: 42, title: 'Budget passed' }] }
      throw new Error(`unexpected ${path}`)
    }),
  }
  const controls = { pause: vi.fn().mockResolvedValue(undefined), resume: vi.fn().mockResolvedValue(undefined), isPaused: vi.fn().mockReturnValue(false), queueStats: vi.fn().mockResolvedValue('write: w=1 a=0 f=0') }
  const videoQueue = { add: vi.fn().mockResolvedValue(undefined) }
  const linear = { createIssue: vi.fn().mockResolvedValue({ identifier: 'ZAV-77', url: 'https://linear.app/zaviya/issue/ZAV-77' }) }
  const exec: ExecDeps = { payload: payload as never, kv, slots: parseSlots(undefined), controls, videoQueue: videoQueue as never, linear, now: () => NOW, ...over }
  return { exec, kv, payload, controls, videoQueue, linear }
}
