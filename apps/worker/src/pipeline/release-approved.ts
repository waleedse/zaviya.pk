import type { Queue } from 'bullmq'
import type { PayloadClient } from '../payload-client.js'
import { logger } from '../logger.js'
import { hasFreshSource } from './pitch.js'

/** An approved cluster idle in triaged/in_review this long went back there after a skipped or failed write (ZAV-107). */
export const APPROVED_IDLE_MIN = 5
/** A cluster 'writing' this long with no job in any queue lost its job; a live write takes well under this. */
export const APPROVED_WRITING_MIN = 45
/** A plain publish decision left in 'triaged' (no editor approval) waits this long before it is released. */
export const PUBLISH_IDLE_MIN = 30
/** After this many releases the cluster is closed with a visible reason instead of looping. */
export const APPROVED_MAX_RELEASES = 3

type JobQueue = Pick<Queue, 'getJobs'>

/** True when any job of the write -> qa -> media -> publish chain still carries this cluster (so releasing it would make a twin article, ZAV-158). */
export async function clusterHasJob(queues: JobQueue[], clusterId: string): Promise<boolean> {
  for (const q of queues) {
    const jobs = await q.getJobs(['active', 'waiting', 'prioritized', 'delayed', 'waiting-children'], 0, 500)
    if (jobs.some((j) => j && String((j.data as { clusterId?: unknown } | undefined)?.clusterId) === clusterId)) return true
  }
  return false
}

/**
 * ZAV-107: a cluster the editor approved (or triage decided to publish) must reach the writer. It used to fall out when
 * the writer found too little source text (status back to 'triaged'), when QA sent it to review, or when the write job was
 * lost; nothing looked at it again. This sweep puts such clusters back on the write queue, at most APPROVED_MAX_RELEASES
 * times, then closes them with the reason so they cannot sit in the pipeline unseen.
 */
export async function releaseStuckApproved(
  deps: {
    payload: Pick<PayloadClient, 'stuckApprovedClusters' | 'getCluster' | 'patchCluster'>
    writeQueue: Pick<Queue, 'add'>
    /** write, qa, media, publish: a cluster with a job in any of them is not stuck */
    chain: JobQueue[]
  },
  now = Date.now(),
): Promise<number> {
  const { clusters } = await deps.payload.stuckApprovedClusters(APPROVED_IDLE_MIN, APPROVED_WRITING_MIN, PUBLISH_IDLE_MIN)
  const slot = Math.floor(now / (5 * 60_000))
  let released = 0
  for (const c of clusters) {
    try {
      if (await clusterHasJob(deps.chain, c.id)) continue
      const cluster = await deps.payload.getCluster(c.id)
      if (cluster.article) continue
      const triage = (cluster.triage ?? c.triage ?? {}) as Record<string, unknown>
      const releases = Number(triage.releaseCount ?? 0)
      const close = async (codeOutcome: string, deferReason: string) => {
        await deps.payload.patchCluster(c.id, { status: 'rejected', triage: { ...triage, codeOutcome, deferReason } })
        logger.warn({ clusterId: c.id, status: c.status, releases, reason: deferReason }, 'stuck approved cluster closed')
      }
      if (cluster.items.length && !hasFreshSource(cluster.items)) {
        await close('reject', 'stale sources: no source from the last 18 hours')
        continue
      }
      if (releases >= APPROVED_MAX_RELEASES) {
        await close('editor_reject', `approved but not written after ${releases} releases (last status ${c.status}): source text too thin or the draft failed QA`)
        continue
      }
      await deps.payload.patchCluster(c.id, {
        status: 'writing',
        triage: { ...triage, codeOutcome: 'publish', releaseCount: releases + 1, lastReleasedAt: new Date(now).toISOString() },
      })
      await deps.writeQueue.add('write', { clusterId: c.id }, { priority: triage.suggestedPriority === 'high' ? 2 : 3, jobId: `write-release-${c.id}-${slot}` })
      logger.info({ clusterId: c.id, from: c.status, idleSince: c.updatedAt, release: releases + 1 }, 'stuck approved cluster released')
      released++
    } catch (e) {
      logger.warn({ clusterId: c.id, err: e instanceof Error ? e.message : e }, 'stuck approved cluster: release failed')
    }
  }
  return released
}
