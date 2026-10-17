import { describe, it, expect, vi } from 'vitest'
import { releaseRejectedDraft } from './publish.js'

const payload = (docs: { id: number }[]) => ({
  request: vi.fn(async () => ({ docs })),
  patchCluster: vi.fn(async () => ({})),
})

describe('releaseRejectedDraft', () => {
  it('points the cluster back at its live article and leaves status alone', async () => {
    const p = payload([{ id: 316 }])
    expect(await releaseRejectedDraft('2841', p as never)).toBe('kept-live')
    expect(p.patchCluster).toHaveBeenCalledWith('2841', { article: '316' })
  })
  it('sends a cluster with no live article back to triaged for a rewrite', async () => {
    const p = payload([])
    expect(await releaseRejectedDraft('2930', p as never)).toBe('triaged')
    expect(p.patchCluster).toHaveBeenCalledWith('2930', { status: 'triaged' })
  })
})
