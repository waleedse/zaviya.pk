import { describe, it, expect, vi } from 'vitest'
import { APPROVED_IDLE_MIN, APPROVED_MAX_RELEASES, APPROVED_WRITING_MIN, PUBLISH_IDLE_MIN, clusterHasJob, releaseStuckApproved } from './release-approved.js'

const T = Date.parse('2026-10-23T10:00:00Z')
const fresh = [{ id: 'i1', title: 't', url: 'u', publishedAt: new Date(T - 3_600_000).toISOString(), source: { name: 'Dawn', trustTier: 1 } }]
const old = [{ id: 'i1', title: 't', url: 'u', publishedAt: new Date(T - 30 * 3_600_000).toISOString(), source: { name: 'Dawn', trustTier: 1 } }]

function setup(opts: { status?: string; triage?: Record<string, unknown>; items?: unknown[]; queued?: boolean; article?: string | null } = {}) {
  const triage = opts.triage ?? { codeOutcome: 'publish', editorApproved: true, suggestedPriority: 'high' }
  const payload = {
    stuckApprovedClusters: vi.fn().mockResolvedValue({ clusters: [{ id: '12025', status: opts.status ?? 'triaged', updatedAt: 'x', triage }] }),
    getCluster: vi.fn().mockResolvedValue({ id: '12025', status: opts.status ?? 'triaged', triage, items: opts.items ?? fresh, article: opts.article ?? null }),
    patchCluster: vi.fn().mockResolvedValue({ ok: true }),
  }
  const writeQueue = { add: vi.fn() }
  const chain = [{ getJobs: vi.fn().mockResolvedValue(opts.queued ? [{ data: { clusterId: '12025' } }] : [{ data: { clusterId: '1' } }]) }]
  return { payload, writeQueue, chain }
}

describe('releaseStuckApproved (ZAV-107)', () => {
  it('asks for the idle times and puts an approved triaged cluster back on the write queue', async () => {
    const d = setup()
    expect(await releaseStuckApproved(d as never, T)).toBe(1)
    expect(d.payload.stuckApprovedClusters).toHaveBeenCalledWith(APPROVED_IDLE_MIN, APPROVED_WRITING_MIN, PUBLISH_IDLE_MIN)
    const [id, body] = d.payload.patchCluster.mock.calls[0]!
    expect(id).toBe('12025')
    expect(body.status).toBe('writing')
    expect(body.triage).toMatchObject({ editorApproved: true, codeOutcome: 'publish', releaseCount: 1 })
    const [name, data, opts] = d.writeQueue.add.mock.calls[0]!
    expect(name).toBe('write')
    expect(data).toEqual({ clusterId: '12025' })
    expect(opts.priority).toBe(2)
    expect(opts.jobId).toBe(`write-release-12025-${Math.floor(T / 300_000)}`)
  })

  it('also releases an in_review cluster the editor approved (QA failed earlier)', async () => {
    const d = setup({ status: 'in_review' })
    expect(await releaseStuckApproved(d as never, T)).toBe(1)
  })

  it('leaves a cluster alone while a job for it is in the write chain (no twin articles)', async () => {
    const d = setup({ queued: true })
    expect(await releaseStuckApproved(d as never, T)).toBe(0)
    expect(d.payload.patchCluster).not.toHaveBeenCalled()
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('skips a cluster that got an article meanwhile', async () => {
    const d = setup({ article: '1500' })
    expect(await releaseStuckApproved(d as never, T)).toBe(0)
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('closes a cluster with no source from the last 18 hours', async () => {
    const d = setup({ items: old })
    expect(await releaseStuckApproved(d as never, T)).toBe(0)
    expect(d.payload.patchCluster.mock.calls[0]![1]).toMatchObject({ status: 'rejected', triage: { codeOutcome: 'reject' } })
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('gives up after the maximum number of releases and says why', async () => {
    const d = setup({ triage: { codeOutcome: 'publish', editorApproved: true, releaseCount: APPROVED_MAX_RELEASES } })
    expect(await releaseStuckApproved(d as never, T)).toBe(0)
    const body = d.payload.patchCluster.mock.calls[0]![1]
    expect(body.status).toBe('rejected')
    expect(body.triage.deferReason).toMatch(/not written after 3 releases/)
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('one failing cluster does not stop the others', async () => {
    const d = setup()
    d.payload.stuckApprovedClusters.mockResolvedValue({ clusters: [{ id: 'a', status: 'triaged', updatedAt: 'x', triage: {} }, { id: '12025', status: 'triaged', updatedAt: 'x', triage: {} }] })
    d.payload.getCluster.mockRejectedValueOnce(new Error('boom'))
    expect(await releaseStuckApproved(d as never, T)).toBe(1)
  })
})

describe('clusterHasJob', () => {
  it('matches the cluster id as text', async () => {
    expect(await clusterHasJob([{ getJobs: vi.fn().mockResolvedValue([{ data: { clusterId: 12025 } }]) }], '12025')).toBe(true)
    expect(await clusterHasJob([{ getJobs: vi.fn().mockResolvedValue([]) }], '12025')).toBe(false)
  })
})
