import { describe, expect, it, vi } from 'vitest'
import { postWithRetry } from './post-retry.js'

describe('postWithRetry', () => {
  it('returns at once on success and does not retry a permanent failure', async () => {
    const sleep = vi.fn(async () => {})
    expect(await postWithRetry(async () => ({ ok: true, id: '1' }), sleep)).toEqual({ ok: true, id: '1' })
    const perm = vi.fn(async () => ({ ok: false, error: 'META_PAGE_TOKEN is not set' }))
    expect((await postWithRetry(perm, sleep)).ok).toBe(false)
    expect(perm).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('tries once more after a processing failure and reports both errors if it fails again', async () => {
    const sleep = vi.fn(async () => {})
    let n = 0
    const flaky = async () => (++n === 1 ? { ok: false, error: 'processing: timed out after 8 min' } : { ok: true, id: '2' })
    expect(await postWithRetry(flaky, sleep, 5)).toEqual({ ok: true, id: '2' })
    expect(sleep).toHaveBeenCalledWith(5)
    const always = async () => ({ ok: false, error: 'processing: timed out after 8 min' })
    const r = await postWithRetry(always, sleep, 5)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/after a retry/)
  })

  it('turns a thrown error into a failure result', async () => {
    const r = await postWithRetry(async () => { throw new Error('socket hang up') }, async () => {})
    expect(r).toEqual({ ok: false, error: 'socket hang up' })
  })
})
