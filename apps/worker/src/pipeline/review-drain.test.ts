import { describe, it, expect, vi } from 'vitest'
import { REVIEW_DRAIN_BATCH, decideStaleReview, drainReviewQueue } from './review-drain.js'
import type { ReviewBacklogCluster } from '../payload-client.js'

const NOW = Date.parse('2026-11-04T12:00:00Z')
const fresh = new Date(NOW - 2 * 3_600_000).toISOString()
const old = new Date(NOW - 30 * 3_600_000).toISOString()

const baseTriage = { pakistanRelevance: 0.8, newsworthiness: 0.7, sourceCredibility: 0.8, category: 'pakistan', sensitivityFlags: ['violence'], decision: 'review', weightedScore: 0.75 }
const cluster = (over: Partial<ReviewBacklogCluster> = {}): ReviewBacklogCluster => ({
  id: '1',
  headline: 'Pakistan and China sign energy deal',
  updatedAt: 'x',
  distinctSources: 2,
  maxTier: 2,
  triage: baseTriage,
  review: { id: '10', reason: 'Sensitivity flags: violence', flags: ['violence'], decision: null },
  ...over,
})
const items = [{ title: 'Pakistan and China sign energy deal - Dawn', publishedAt: fresh }]

describe('decideStaleReview (ZAV-301)', () => {
  it('writes a flagged story whose score clears the review threshold', () => {
    expect(decideStaleReview(cluster(), items, {}, NOW).action).toBe('write')
  })

  it.each(['blasphemy', 'minor'])('no longer guards the %s flag: written like any other story (13 Nov)', (flag) => {
    const v = decideStaleReview(cluster({ triage: { ...baseTriage, sensitivityFlags: [flag] } }), items, {}, NOW)
    expect(v.action).toBe('write')
  })

  it('closes a draft QA could not verify', () => {
    const v = decideStaleReview(cluster({ review: { id: '1', reason: 'QA failed: Unsupported: Liu arrived in Islamabad', flags: ['unverified'], decision: null } }), items, {}, NOW)
    expect(v.action).toBe('reject')
    expect(v.reason).toMatch(/QA could not verify/)
  })

  it('closes stale sources, opinion and a low score, each with its reason', () => {
    expect(decideStaleReview(cluster(), [{ title: 'old', publishedAt: old }], {}, NOW).reason).toMatch(/stale sources/)
    expect(decideStaleReview(cluster(), [{ title: 'Editorial: Glacial collapse - Dawn', publishedAt: fresh }], {}, NOW).reason).toMatch(/opinion/)
    const low = cluster({ triage: { pakistanRelevance: 0.1, newsworthiness: 0.4, sourceCredibility: 0.5, category: 'world', sensitivityFlags: [], decision: 'review' } })
    expect(decideStaleReview(low, items, {}, NOW).reason).toMatch(/below the review threshold/)
  })

  it('a major world story the model scored 0.46 is written once the relevance floor applies; an unrelated foreign story with the same scores is not', () => {
    const triage = { pakistanRelevance: 0.1, newsworthiness: 0.7, sourceCredibility: 0.85, category: 'world', sensitivityFlags: ['violence'], decision: 'review', weightedScore: 0.46 }
    const iran = cluster({ headline: "Trump Threatens Strike On Iran's Pickaxe Mountain, Says US Can Hit Target", triage })
    expect(decideStaleReview(iran, items, {}, NOW).action).toBe('write')
    const dogs = cluster({ headline: 'Dog show winners announced in Madrid', triage })
    expect(decideStaleReview(dogs, [{ title: 'Dog show winners announced in Madrid', publishedAt: fresh }], {}, NOW).action).toBe('reject')
  })

  it('respects the model reject on a non-world story and a lone tier-3 source', () => {
    expect(decideStaleReview(cluster({ triage: { ...baseTriage, decision: 'reject' } }), items, {}, NOW).reason).toMatch(/model rejected/)
    expect(decideStaleReview(cluster({ maxTier: 3, distinctSources: 1 }), items, {}, NOW).reason).toMatch(/tier-3/)
  })
})

describe('drainReviewQueue (ZAV-301)', () => {
  const setup = (clusters: ReviewBacklogCluster[], detail?: (id: string) => unknown) => {
    const payload = {
      reviewBacklog: vi.fn().mockResolvedValue({ clusters }),
      getCluster: vi.fn().mockImplementation(async (id: string) =>
        detail ? detail(id) : { id, status: 'in_review', article: null, triage: clusters.find((c) => c.id === id)!.triage, items },
      ),
      getSettings: vi.fn().mockResolvedValue({}),
      patchCluster: vi.fn().mockResolvedValue({ ok: true }),
      patchReview: vi.fn().mockResolvedValue({ ok: true }),
    }
    const writeQueue = { add: vi.fn() }
    return { payload, writeQueue }
  }

  it('asks for clusters idle 30 min, writes the good ones without an editor gate and closes the unverified with a reason', async () => {
    const good = cluster({ id: '1' })
    const bad = cluster({ id: '2', triage: { ...baseTriage, sensitivityFlags: ['unverified'] }, review: { id: '20', reason: 'unverified claim', flags: ['unverified'], decision: null } })
    const d = setup([good, bad])
    const r = await drainReviewQueue(d as never, NOW)
    expect(d.payload.reviewBacklog).toHaveBeenCalledWith(30)
    expect(r).toEqual({ written: 1, rejected: 1, waiting: 0 })
    const w = d.payload.patchCluster.mock.calls.find((c) => c[0] === '1')![1]
    expect(w.status).toBe('writing')
    expect(w.triage).toMatchObject({ codeOutcome: 'publish', editorApproved: true })
    expect(d.writeQueue.add).toHaveBeenCalledTimes(1)
    expect(d.writeQueue.add.mock.calls[0]![1]).toEqual({ clusterId: '1' })
    const rej = d.payload.patchCluster.mock.calls.find((c) => c[0] === '2')![1]
    expect(rej).toMatchObject({ status: 'rejected', triage: { codeOutcome: 'reject' } })
    expect(rej.triage.deferReason).toMatch(/^review drain:/)
    expect(d.payload.patchReview).toHaveBeenCalledWith('10', { decision: 'approve', decidedBy: 'auto-drain' })
    expect(d.payload.patchReview).toHaveBeenCalledWith('20', { decision: 'reject', decidedBy: 'auto-drain' })
  })

  it(`sends at most ${REVIEW_DRAIN_BATCH} stories to the writer per sweep, best score first; the rest wait in review`, async () => {
    const many = Array.from({ length: 8 }, (_, i) => cluster({ id: String(i + 1), triage: { ...baseTriage, pakistanRelevance: 0.5 + i * 0.05 } }))
    const d = setup(many)
    const r = await drainReviewQueue(d as never, NOW)
    expect(r).toEqual({ written: REVIEW_DRAIN_BATCH, rejected: 0, waiting: 3 })
    expect(d.writeQueue.add.mock.calls[0]![1]).toEqual({ clusterId: '8' })
  })

  it('leaves a held cluster, one that already has an article, and one that left review in the meantime', async () => {
    const held = cluster({ id: '1', review: { id: '1', reason: 'x', flags: [], decision: 'hold' } })
    const d = setup([held, cluster({ id: '2' }), cluster({ id: '3' })], (id) => ({ id, status: id === '3' ? 'writing' : 'in_review', article: id === '2' ? '99' : null, triage: {}, items }))
    const r = await drainReviewQueue(d as never, NOW)
    expect(r).toEqual({ written: 0, rejected: 0, waiting: 0 })
    expect(d.payload.patchCluster).not.toHaveBeenCalled()
    expect(d.writeQueue.add).not.toHaveBeenCalled()
  })

  it('does nothing when the backlog is empty; one failing cluster does not stop the rest', async () => {
    const empty = setup([])
    expect(await drainReviewQueue(empty as never, NOW)).toEqual({ written: 0, rejected: 0, waiting: 0 })
    expect(empty.payload.getSettings).not.toHaveBeenCalled()
    const d = setup([cluster({ id: '1' }), cluster({ id: '2' })], (id) => {
      if (id === '1') throw new Error('boom')
      return { id, status: 'in_review', article: null, triage: baseTriage, items }
    })
    expect((await drainReviewQueue(d as never, NOW)).written).toBe(1)
  })
})
