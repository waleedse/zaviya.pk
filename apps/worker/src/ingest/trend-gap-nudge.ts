import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { ClusterDetail, PayloadClient } from '../payload-client.js'
import { clusterHasJob } from '../pipeline/release-approved.js'
import { logger } from '../logger.js'

/**
 * ZG-21 follow-up. The items the trend-gap job ingests join a cluster by embedding. That cluster may be one that stalled
 * (12 Nov: cluster 34011, the U19 Asia Cup semi-final, 44 items and 14 sources, sat in 'writing' with no article and no
 * job, and embed never queues triage for a cluster in 'writing'), or one triaged earlier without the trend mark.
 * Each ingested item is remembered; a few minutes later its cluster is looked at and, when it stalled, triage or write
 * is queued again. The re-run triage sees the `Trend gap:` mark (trendsHit, extra publish slots).
 */

export const PENDING_KEY = 'zaviya:trendgap:pending'
/** Give the normal embed -> triage path this long first */
export const NUDGE_AFTER_MS = 8 * 60_000
export const NUDGE_EVERY_MS = 10 * 60_000
export const NUDGE_MAX = 3
export const PENDING_MAX_AGE_MS = 8 * 3_600_000

export type PendingRedis = Pick<Redis, 'hset' | 'hdel' | 'hgetall'>

interface Pending {
  term: string
  at: number
  nudges: number
  lastNudgeAt?: number
}

export async function rememberPending(redis: Pick<Redis, 'hset'>, term: string, itemIds: string[], now: number): Promise<void> {
  for (const id of itemIds) await redis.hset(PENDING_KEY, id, JSON.stringify({ term, at: now, nudges: 0 } satisfies Pending))
}

export interface NudgeDeps {
  redis: PendingRedis
  payload: Pick<PayloadClient, 'request' | 'getCluster' | 'patchCluster'>
  writeQueue: Pick<Queue, 'add'>
  triageQueue: Pick<Queue, 'add'>
  /** write, qa, media, publish: a cluster with a job in any of them is not stalled */
  chain: Pick<Queue, 'getJobs'>[]
  now?: () => number
}

export type NudgeAction = 'write' | 'triage' | 'waiting' | 'done' | 'gave-up' | 'no-cluster'

/** Decides what a cluster that trend-gap items joined needs. Pure apart from the job check done by the caller. */
export function nudgeAction(cluster: Pick<ClusterDetail, 'status' | 'article' | 'triage'>, hasJob: boolean): 'write' | 'triage' | 'done' | 'waiting' {
  if (cluster.article || ['published', 'updated', 'rejected'].includes(cluster.status)) return 'done'
  const triage = (cluster.triage ?? {}) as { trendGap?: boolean }
  if (cluster.status === 'writing') return hasJob ? 'waiting' : 'write'
  if (cluster.status === 'new') return 'triage'
  // triaged before the trend mark existed (or by an earlier run): triage again so it counts as a trend story
  if (cluster.status === 'triaged' && !triage.trendGap) return 'triage'
  return 'waiting'
}

export async function nudgeTrendClusters(deps: NudgeDeps): Promise<{ id: string; term: string; action: NudgeAction }[]> {
  const now = (deps.now ?? Date.now)()
  const slot = Math.floor(now / NUDGE_EVERY_MS)
  const all = await deps.redis.hgetall(PENDING_KEY)
  const out: { id: string; term: string; action: NudgeAction }[] = []
  const seenClusters = new Set<string>()
  for (const [itemId, raw] of Object.entries(all)) {
    let p: Pending
    try {
      p = JSON.parse(raw) as Pending
    } catch {
      await deps.redis.hdel(PENDING_KEY, itemId)
      continue
    }
    const age = now - p.at
    if (age > PENDING_MAX_AGE_MS) {
      await deps.redis.hdel(PENDING_KEY, itemId)
      out.push({ id: itemId, term: p.term, action: 'gave-up' })
      continue
    }
    if (age < NUDGE_AFTER_MS || (p.lastNudgeAt && now - p.lastNudgeAt < NUDGE_EVERY_MS)) continue
    try {
      const item = await deps.payload.request<{ cluster?: number | string | { id: number | string } | null }>('GET', `/api/source-items/${itemId}?depth=0`)
      const cid = item.cluster && typeof item.cluster === 'object' ? String(item.cluster.id) : item.cluster ? String(item.cluster) : ''
      if (!cid) {
        out.push({ id: itemId, term: p.term, action: 'no-cluster' })
        continue
      }
      if (seenClusters.has(cid)) continue
      seenClusters.add(cid)
      const cluster = await deps.payload.getCluster(cid)
      const hasJob = cluster.status === 'writing' ? await clusterHasJob(deps.chain, cid) : false
      const action = nudgeAction(cluster, hasJob)
      if (action === 'done') {
        await deps.redis.hdel(PENDING_KEY, itemId)
        out.push({ id: cid, term: p.term, action })
        continue
      }
      if (action === 'waiting') {
        out.push({ id: cid, term: p.term, action })
        continue
      }
      if (p.nudges >= NUDGE_MAX) {
        await deps.redis.hdel(PENDING_KEY, itemId)
        logger.warn({ clusterId: cid, term: p.term }, 'trend gap: cluster still stalled after 3 nudges, left to the normal sweeps')
        out.push({ id: cid, term: p.term, action: 'gave-up' })
        continue
      }
      if (action === 'write') {
        const triage = (cluster.triage ?? {}) as Record<string, unknown>
        await deps.payload.patchCluster(cid, { status: 'writing', triage: { ...triage, codeOutcome: 'publish', trendGap: true } })
        await deps.writeQueue.add('write', { clusterId: cid }, { priority: 2, jobId: `write-trendgap-${cid}-${slot}` })
      } else {
        await deps.triageQueue.add('triage', { clusterId: cid }, { priority: 2, jobId: `triage-trendgap-${cid}-${slot}`, removeOnComplete: true })
      }
      await deps.redis.hset(PENDING_KEY, itemId, JSON.stringify({ ...p, nudges: p.nudges + 1, lastNudgeAt: now } satisfies Pending))
      logger.info({ clusterId: cid, term: p.term, status: cluster.status, action, nudge: p.nudges + 1 }, 'trend gap: stalled cluster re-queued')
      out.push({ id: cid, term: p.term, action })
    } catch (e) {
      logger.warn({ itemId, err: e instanceof Error ? e.message : e }, 'trend gap: could not check the cluster of an ingested item')
    }
  }
  return out
}
