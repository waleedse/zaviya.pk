import { describe, expect, it, vi } from 'vitest'
import { runEmbedBackfill } from './embed-backfill.js'

const router = (embed = vi.fn(async (_t: string, input: string[]) => input.map(() => [0.5]))) => ({ embed, embedModelId: () => 'local-embed:m' }) as never

describe('runEmbedBackfill', () => {
  it('re-embeds batches under the new model until nothing carries another model', async () => {
    const batches = [
      { items: [{ id: '1', title: 'A', summary: 'x' }, { id: '2', title: 'B', summary: null }] },
      { items: [{ id: '3', title: 'C', summary: null }] },
      { items: [] },
    ]
    const reembedCandidates = vi.fn(async () => batches.shift()!)
    const storeReembedded = vi.fn(async (_m: string, items: unknown[]) => ({ stored: items.length }))
    const embed = vi.fn(async (_t: string, input: string[]) => input.map(() => [0.5]))
    const out = await runEmbedBackfill({ router: router(embed), payload: { reembedCandidates, storeReembedded } as never, hours: 72 })
    expect(out.done).toBe(3)
    expect(reembedCandidates).toHaveBeenCalledWith('local-embed:m', 72, 32)
    expect(embed).toHaveBeenNthCalledWith(1, 'embed', ['A\nx', 'B'])
    expect(storeReembedded).toHaveBeenCalledWith('local-embed:m', [{ id: '1', embedding: [0.5] }, { id: '2', embedding: [0.5] }])
  })

  it('does nothing when switched off', async () => {
    const reembedCandidates = vi.fn()
    expect(await runEmbedBackfill({ router: router(), payload: { reembedCandidates } as never, hours: 0 })).toEqual({ done: 0 })
    expect(reembedCandidates).not.toHaveBeenCalled()
  })

  it('stops quietly when embedding fails and when nothing could be stored', async () => {
    const reembedCandidates = vi.fn(async () => ({ items: [{ id: '1', title: 'A', summary: null }] }))
    const failing = router(vi.fn(async () => { throw new Error('boom') }))
    expect(await runEmbedBackfill({ router: failing, payload: { reembedCandidates } as never, hours: 72 })).toEqual({ done: 0 })
    const storeReembedded = vi.fn(async () => ({ stored: 0 }))
    await runEmbedBackfill({ router: router(), payload: { reembedCandidates, storeReembedded } as never, hours: 72 })
    expect(reembedCandidates).toHaveBeenCalledTimes(2) // no endless loop on an unwritable batch
  })
})
