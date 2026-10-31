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

/** Sources older than this are not news today (ZAV-89: an April story, ZAV-154: a 2-day-old one, was published as today's). */
export const MAX_SOURCE_AGE_MS = 18 * 60 * 60_000

/** True when at least one source was published within the last 18 hours (items without a date do not count). */
export function hasFreshSource(items: { publishedAt?: string }[], now = Date.now()): boolean {
  return items.some((i) => {
    const t = i.publishedAt ? Date.parse(i.publishedAt) : NaN
    return Number.isFinite(t) && now - t <= MAX_SOURCE_AGE_MS
  })
}

/**
 * ZAV-186: the 18 h rule is judged when the editor approves. A story approved with a fresh source then waits for the
 * writer and for the publish pacing slots (hours on a busy day) and used to be rejected as stale at the very end. Such a
 * story keeps its freshness for this long after approval.
 */
export const APPROVAL_GRACE_MS = 8 * 60 * 60_000

/** Fresh now, or (editor-approved) fresh at approval time and published within APPROVAL_GRACE_MS of it. */
export function freshForApproved(items: { publishedAt?: string }[], triage: unknown, now = Date.now()): boolean {
  if (hasFreshSource(items, now)) return true
  if (!editorApproved(triage)) return false
  const at = Date.parse(String((triage as { editorApprovedAt?: unknown }).editorApprovedAt ?? ''))
  return Number.isFinite(at) && now - at <= APPROVAL_GRACE_MS && hasFreshSource(items, at)
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

/**
 * ZAV-237: a cluster triage deferred for pacing (daily cap, interval, window) sits as triaged/defer until its retry.
 * The editor's write decision (or the floor) is stronger than pacing, so it must not be refused as "not a pitch".
 */
export function isPacingDefer(triage: Record<string, unknown>, status?: string): boolean {
  return (
    status === 'triaged' &&
    triage.codeOutcome === 'defer' &&
    /^(Daily publish cap|Minimum interval|Outside publish window)/.test(String(triage.deferReason ?? ''))
  )
}

export async function decidePitch(
  clusterId: string,
  action: 'write' | 'reject',
  deps: { payload: PayloadClient; writeQueue: Pick<Queue, 'add'>; redis: Redis; triageQueue?: Pick<Queue, 'add'> },
  note = '',
): Promise<boolean> {
  const cluster = await deps.payload.getCluster(clusterId)
  const triage = (cluster.triage ?? {}) as Record<string, unknown>
  // ZAV-267: a story the editor wants written that has not been triaged yet has no pitch to approve. Jump it to the
  // front of the triage queue (it then reaches the editor as a pitch) instead of dropping the command silently.
  if (action === 'write' && cluster.status === 'new' && !triage.codeOutcome && deps.triageQueue) {
    await deps.triageQueue.add('triage', { clusterId }, { priority: 1, jobId: `triage-editor-${clusterId}-${Math.floor(Date.now() / 600_000)}`, removeOnComplete: true })
    logger.info({ clusterId }, 'editor asked to write an untriaged story: triage moved to the front')
    return true
  }
  if (triage.codeOutcome !== 'pitch' && !(action === 'write' && isPacingDefer(triage, cluster.status))) return false
  if (action === 'write' && cluster.items?.length && !hasFreshSource(cluster.items)) {
    await deps.payload.patchCluster(clusterId, { status: 'rejected', triage: { ...triage, codeOutcome: 'editor_reject', editorNote: 'stale sources' } })
    logger.warn({ clusterId }, 'pitch refused: no source from the last 18 hours')
    return false
  }
  if (action === 'reject') {
    await deps.payload.patchCluster(clusterId, { status: 'rejected', triage: { ...triage, codeOutcome: 'editor_reject', editorNote: note } })
    logger.info({ clusterId }, 'editor rejected the pitch')
    return true
  }
  await deps.payload.patchCluster(clusterId, {
    status: 'writing',
    triage: { ...triage, codeOutcome: 'publish', editorApproved: true, editorApprovedAt: new Date().toISOString(), editorNote: note },
  })
  await deps.writeQueue.add('write', { clusterId }, { priority: triage.suggestedPriority === 'high' ? 2 : 3 })
  await deps.redis.set(PITCH_APPROVED_KEY, String(Date.now()))
  logger.info({ clusterId }, 'editor approved the pitch: writing it now')
  return true
}

/**
 * Zaviya must put out at least 4 stories an hour (Waleed, 16 Oct): below that, a waiting pitch is
 * written every 15 minutes even while the editor is active.
 */
export const HOURLY_FLOOR = 4
export const FLOOR_SPACING_MIN = 15
/** On a slow news hour the evergreen desks (AI, big tech and business companies) fill the gap. */
export const QUIET_CATEGORIES = ['ai', 'tech-telecom', 'business']
const STRONG_SCORE = 0.6

/** The best pitch; when nothing is strong, the best one from the evergreen desks. */
export function floorPitch(pitches: Pitch[]): Pitch | undefined {
  const best = bestPitch(pitches)
  if (!best || (best.weightedScore ?? 0) >= STRONG_SCORE) return best
  return bestPitch(pitches.filter((p) => p.category && QUIET_CATEGORIES.includes(p.category))) ?? best
}

async function publishedLastHour(payload: PayloadClient, now = Date.now()): Promise<number> {
  const since = new Date(now - 60 * 60_000).toISOString()
  const res = await payload.request<{ totalDocs?: number }>(
    'GET',
    `/api/articles?where[_status][equals]=published&where[publishedAt][greater_than]=${encodeURIComponent(since)}&limit=0&depth=0`,
  )
  return res.totalDocs ?? 0
}

/**
 * Writes a waiting pitch when the editor approved nothing for `minutes` (editor down or slow), or when
 * fewer than HOURLY_FLOOR stories went out in the last hour (one every FLOOR_SPACING_MIN minutes).
 */
export async function pitchFallback(
  deps: { payload: PayloadClient; writeQueue: Pick<Queue, 'add'>; redis: Redis },
  minutes: number,
  now = Date.now(),
): Promise<void> {
  const last = Number(await deps.redis.get(PITCH_APPROVED_KEY))
  if (!last) {
    // First run after a deploy: start the clock instead of writing at once
    await deps.redis.set(PITCH_APPROVED_KEY, String(now))
    return
  }
  const idle = now - last
  if (idle < FLOOR_SPACING_MIN * 60_000) return
  let reason = 'fallback: editor did not decide'
  if (idle < minutes * 60_000) {
    const out = await publishedLastHour(deps.payload, now)
    if (out >= HOURLY_FLOOR) return
    reason = `fallback: ${out} stories in the last hour, below ${HOURLY_FLOOR}`
  }
  const pitches = await deps.payload.request<Pitch[]>('GET', '/api/pipeline/pitches')
  const pick = floorPitch(pitches)
  if (!pick) return
  logger.warn({ clusterId: pick.clusterId, category: pick.category, reason }, 'pitch fallback: writing a waiting pitch')
  await decidePitch(pick.clusterId, 'write', deps, reason)
}

/** First two sentences (at most 400 characters) of the best real source text; '' when every source is a headline only. */
export function pitchSummary(items: { title: string; summary?: string; contentText?: string }[]): string {
  let best = ''
  for (const it of items) {
    for (const raw of [it.contentText, it.summary]) {
      const text = (raw ?? '').replace(/\(Read from [^)]*\)/g, '').replace(/\s+/g, ' ').trim()
      // Google News summaries just repeat the headline and the outlet
      if (text.length > it.title.length + 40 && text.length > best.length) best = text
    }
  }
  if (!best) return ''
  const sentences = best.split(/(?<=[.!?])\s+/)
  let out = ''
  for (const s of sentences.slice(0, 2)) {
    if ((out ? `${out} ${s}` : s).length > 400) break
    out = out ? `${out} ${s}` : s
  }
  return (out || best.slice(0, 400)).trim()
}
