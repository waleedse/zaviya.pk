import { describe, it, expect, vi } from 'vitest'
import { bestPitch, decidePitch, editorApproved, pitchFallback, shouldPitch, PITCH_APPROVED_KEY } from './pitch.js'
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
