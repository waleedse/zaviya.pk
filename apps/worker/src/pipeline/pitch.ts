import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { Priority } from '@zaviya/shared'
import type { PayloadClient } from '../payload-client.js'
import { logger } from '../logger.js'

/**
 * Editor pitch: a normal story goes to the editor as a short pitch (headline, triage reason, sources)
 * and is written only once approved. Before this the writer wrote every story triage passed and the
 * editor rejected about two thirds of them afterwards (15 Oct: 77 written, ~26 published), which used up
 * the writer limits by mid-morning. Breaking news and live updates still go straight to the writer.
 */

/** When the last pitch was approved (ms), for the fallback */
export const PITCH_APPROVED_KEY = 'zaviya:pitch:lastApproved'

export function shouldPitch(o: { pitch: boolean; priority?: Priority | string; isUpdate?: boolean }): boolean {
  return o.pitch && o.priority !== 'breaking' && !o.isUpdate
}

/** The editor already chose this story before it was written: no second wait at the article gate. */
export function editorApproved(triage: unknown): boolean {
  return Boolean(triage && typeof triage === 'object' && (triage as { editorApproved?: unknown }).editorApproved === true)
}

export interface Pitch {
  clusterId: string
  headline: string
  category?: string
  priority?: string
  weightedScore?: number
  pitchedAt?: string
}

/** Pick for the fallback: highest score, then the newest. */
export function bestPitch(pitches: Pitch[]): Pitch | undefined {
  return [...pitches].sort(
    (a, b) => (b.weightedScore ?? 0) - (a.weightedScore ?? 0) || Date.parse(b.pitchedAt ?? '0') - Date.parse(a.pitchedAt ?? '0'),
  )[0]
}

export async function decidePitch(
  clusterId: string,
  action: 'write' | 'reject',
  deps: { payload: PayloadClient; writeQueue: Pick<Queue, 'add'>; redis: Redis },
  note = '',
): Promise<boolean> {
  const cluster = await deps.payload.getCluster(clusterId)
  const triage = (cluster.triage ?? {}) as Record<string, unknown>
  if (triage.codeOutcome !== 'pitch') return false
  if (action === 'reject') {
    await deps.payload.patchCluster(clusterId, { status: 'rejected', triage: { ...triage, codeOutcome: 'editor_reject', editorNote: note } })
    logger.info({ clusterId }, 'editor rejected the pitch')
    return true
  }
  await deps.payload.patchCluster(clusterId, {
    status: 'writing',
    triage: { ...triage, codeOutcome: 'publish', editorApproved: true, editorNote: note },
  })
  await deps.writeQueue.add('write', { clusterId }, { priority: triage.suggestedPriority === 'high' ? 2 : 3 })
  await deps.redis.set(PITCH_APPROVED_KEY, String(Date.now()))
  logger.info({ clusterId }, 'editor approved the pitch: writing it now')
  return true
}

/** When the editor approved nothing for `minutes` but pitches wait, write the best one (editor down or slow). */
export async function pitchFallback(
  deps: { payload: PayloadClient; writeQueue: Pick<Queue, 'add'>; redis: Redis },
  minutes: number,
): Promise<void> {
  const last = Number(await deps.redis.get(PITCH_APPROVED_KEY))
  if (!last) {
    // First run after a deploy: start the clock instead of writing at once
    await deps.redis.set(PITCH_APPROVED_KEY, String(Date.now()))
    return
  }
  if (Date.now() - last < minutes * 60_000) return
  const pitches = await deps.payload.request<Pitch[]>('GET', '/api/pipeline/pitches')
  const pick = bestPitch(pitches)
  if (!pick) return
  logger.warn({ clusterId: pick.clusterId, minutes }, 'pitch fallback: writing the best waiting pitch')
  await decidePitch(pick.clusterId, 'write', deps, 'fallback: editor did not decide')
}
