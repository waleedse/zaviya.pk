import { describe, it, expect, vi } from 'vitest'
import { bestPitch, decidePitch, pitchSummary, editorApproved, floorPitch, pitchFallback, shouldPitch, PITCH_APPROVED_KEY } from './pitch.js'
import { deferImage } from './media.js'

function fakeRedis(init: Record<string, string> = {}) {
  const store = { ...init }
  return {
    store,
    get: vi.fn(async (k: string) => store[k] ?? null),
    set: vi.fn(async (k: string, v: string) => {
      store[k] = v
      return 'OK'
    }),
  }
}

function fakePayload(triage: Record<string, unknown>, pitches: unknown[] = []) {
  return {
    getCluster: vi.fn(async () => ({ triage })),
    patchCluster: vi.fn(async () => ({})),
    request: vi.fn(async () => pitches),
  }
}

describe('shouldPitch', () => {
  it('pitches normal and high stories, never breaking news or live updates', () => {
    expect(shouldPitch({ pitch: true, priority: 'normal' })).toBe(true)
    expect(shouldPitch({ pitch: true, priority: 'high' })).toBe(true)
    expect(shouldPitch({ pitch: true, priority: 'breaking' })).toBe(false)
    expect(shouldPitch({ pitch: true, priority: 'normal', isUpdate: true })).toBe(false)
    expect(shouldPitch({ pitch: false, priority: 'normal' })).toBe(false)
  })
})

describe('editorApproved', () => {
  it('is true only for an approved pitch', () => {
    expect(editorApproved({ editorApproved: true })).toBe(true)
    expect(editorApproved({ codeOutcome: 'publish' })).toBe(false)
    expect(editorApproved(undefined)).toBe(false)
  })

  it('lets an approved story make its image at once instead of waiting at the article gate', () => {
    expect(deferImage({ gate: true, priority: 'normal' })).toBe(true)
    expect(deferImage({ gate: true, priority: 'normal', approved: true })).toBe(false)
  })
})

describe('decidePitch', () => {
  it('approve: marks the story approved, queues the writer and starts the fallback clock', async () => {
    const payload = fakePayload({ codeOutcome: 'pitch', suggestedPriority: 'high', category: 'pakistan' })
    const writeQueue = { add: vi.fn(async () => ({})) }
    const redis = fakeRedis()
    const ok = await decidePitch('42', 'write', { payload, writeQueue, redis } as never)
    expect(ok).toBe(true)
    expect(payload.patchCluster).toHaveBeenCalledWith('42', {
      status: 'writing',
      triage: expect.objectContaining({ codeOutcome: 'publish', editorApproved: true, category: 'pakistan' }),
    })
    expect(writeQueue.add).toHaveBeenCalledWith('write', { clusterId: '42' }, { priority: 2 })
    expect(redis.store[PITCH_APPROVED_KEY]).toBeDefined()
  })

  it('reject: the story is dropped without being written', async () => {
    const payload = fakePayload({ codeOutcome: 'pitch' })
    const writeQueue = { add: vi.fn() }
    const ok = await decidePitch('42', 'reject', { payload, writeQueue, redis: fakeRedis() } as never, 'thin')
    expect(ok).toBe(true)
    expect(payload.patchCluster).toHaveBeenCalledWith('42', { status: 'rejected', triage: expect.objectContaining({ codeOutcome: 'editor_reject', editorNote: 'thin' }) })
    expect(writeQueue.add).not.toHaveBeenCalled()
  })

  it('ignores a story that is not a waiting pitch (decided twice, or already written)', async () => {
    const payload = fakePayload({ codeOutcome: 'publish', editorApproved: true })
    const writeQueue = { add: vi.fn() }
    expect(await decidePitch('42', 'write', { payload, writeQueue, redis: fakeRedis() } as never)).toBe(false)
    expect(writeQueue.add).not.toHaveBeenCalled()
  })
})

describe('pitch fallback', () => {
  const pitches = [
    { clusterId: '1', headline: 'a', weightedScore: 0.6, pitchedAt: '2026-10-15T10:00:00Z' },
    { clusterId: '2', headline: 'b', weightedScore: 0.8, pitchedAt: '2026-10-15T09:00:00Z' },
  ]

  it('picks the highest score', () => {
    expect(bestPitch(pitches)?.clusterId).toBe('2')
    expect(bestPitch([])).toBeUndefined()
  })

  it('first run only starts the clock', async () => {
    const payload = fakePayload({ codeOutcome: 'pitch' }, pitches)
    const writeQueue = { add: vi.fn() }
    const redis = fakeRedis()
    await pitchFallback({ payload, writeQueue, redis } as never, 40)
    expect(writeQueue.add).not.toHaveBeenCalled()
    expect(redis.store[PITCH_APPROVED_KEY]).toBeDefined()
  })

  it('writes the best pitch when the editor approved nothing for too long', async () => {
    const payload = fakePayload({ codeOutcome: 'pitch' }, pitches)
    const writeQueue = { add: vi.fn(async () => ({})) }
    const redis = fakeRedis({ [PITCH_APPROVED_KEY]: String(Date.now() - 41 * 60_000) })
    await pitchFallback({ payload, writeQueue, redis } as never, 40)
    expect(writeQueue.add).toHaveBeenCalledWith('write', { clusterId: '2' }, { priority: 3 })
  })

  it('waits while the editor is active', async () => {
    const payload = fakePayload({ codeOutcome: 'pitch' }, pitches)
    const writeQueue = { add: vi.fn() }
    const redis = fakeRedis({ [PITCH_APPROVED_KEY]: String(Date.now() - 5 * 60_000) })
    await pitchFallback({ payload, writeQueue, redis } as never, 40)
    expect(writeQueue.add).not.toHaveBeenCalled()
  })
})

describe('hourly floor', () => {
  const pitches = [
    { clusterId: '1', headline: 'a', category: 'pakistan', weightedScore: 0.5 },
    { clusterId: '2', headline: 'b', category: 'ai', weightedScore: 0.45 },
  ]
  const payloadWith = (publishedLastHour: number) => ({
    getCluster: vi.fn(async () => ({ triage: { codeOutcome: 'pitch' } })),
    patchCluster: vi.fn(async () => ({})),
    request: vi.fn(async (_m: string, path: string) => (path.startsWith('/api/articles') ? { totalDocs: publishedLastHour } : pitches)),
  })

  it('writes a pitch every 15 minutes while fewer than 4 stories went out in the last hour', async () => {
    const writeQueue = { add: vi.fn(async () => ({})) }
    const redis = fakeRedis({ [PITCH_APPROVED_KEY]: String(Date.now() - 16 * 60_000) })
    await pitchFallback({ payload: payloadWith(2), writeQueue, redis } as never, 40)
    expect(writeQueue.add).toHaveBeenCalledTimes(1)
  })

  it('leaves it to the editor once 4 stories went out', async () => {
    const writeQueue = { add: vi.fn(async () => ({})) }
    const redis = fakeRedis({ [PITCH_APPROVED_KEY]: String(Date.now() - 16 * 60_000) })
    await pitchFallback({ payload: payloadWith(4), writeQueue, redis } as never, 40)
    expect(writeQueue.add).not.toHaveBeenCalled()
  })

  it('on a slow hour prefers AI, big tech and business stories', () => {
    expect(floorPitch(pitches)?.clusterId).toBe('2')
    expect(floorPitch([{ clusterId: '3', headline: 'c', category: 'pakistan', weightedScore: 0.8 }, ...pitches])?.clusterId).toBe('3')
  })
})

describe('pitchSummary (ZAV-149)', () => {
  it('takes the first two sentences of real source text', () => {
    const items = [{ title: 'Rupee falls', contentText: 'The rupee fell 0.3pc against the dollar on Tuesday. Dealers blamed import payments. A third sentence follows here.\n\n(Read from www.dawn.com)' }]
    expect(pitchSummary(items)).toBe('The rupee fell 0.3pc against the dollar on Tuesday. Dealers blamed import payments.')
  })
  it('is empty when every source only repeats the headline', () => {
    expect(pitchSummary([{ title: 'Rupee falls - Dawn', summary: 'Rupee falls - Dawn' }])).toBe('')
  })
  it('prefers the longest real text and caps the length', () => {
    const long = 'Word '.repeat(300)
    const out = pitchSummary([{ title: 'A headline', summary: 'Short but real summary line that is long enough to count here.' }, { title: 'B', contentText: long }])
    expect(out.length).toBeLessThanOrEqual(400)
    expect(out.startsWith('Word')).toBe(true)
  })
})
