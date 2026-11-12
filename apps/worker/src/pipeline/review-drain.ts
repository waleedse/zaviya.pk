import type { Queue } from 'bullmq'
import type { PayloadClient, PipelineSettings, ReviewBacklogCluster } from '../payload-client.js'
import { logger } from '../logger.js'
import { hasFreshSource } from './pitch.js'
import { computeWeightedScore } from './triage-rules.js'
import { MAJOR_GLOBAL_RELEVANCE, majorGlobalTopic } from './global-news.js'
import { opinionCue } from './story-kind.js'

/**
 * ZAV-301: the review queue was only ever drained by a human (Telegram buttons), and the server has no Telegram. 161
 * clusters sat in `in_review` for three days. Waleed's rule (4 Nov): "do not wait for me". A cluster that has been in
 * review for REVIEW_DRAIN_MIN minutes is decided by plain code:
 *   - blasphemy and minor stay guarded (legal risk in Pakistan): closed, never auto-published;
 *   - a draft QA could not verify, an unverified rumour, a stale or opinion story, a model reject: closed with the reason;
 *   - otherwise it is written when its score clears the review threshold (the same bar AUTO_APPROVE uses), at most
 *     REVIEW_DRAIN_BATCH per sweep so a backlog cannot flood the site. QA still checks every fact before publishing.
 */
export const REVIEW_DRAIN_MIN = 30
export const REVIEW_DRAIN_BATCH = 5
const DEFAULT_REVIEW = 0.5

export type DrainVerdict = { action: 'write'; reason: string; score: number } | { action: 'reject'; reason: string; score: number }

export function decideStaleReview(
  c: Pick<ReviewBacklogCluster, 'headline' | 'triage' | 'review' | 'distinctSources' | 'maxTier'>,
  items: { title: string; url?: string; summary?: string; contentText?: string; publishedAt?: string }[],
  settings: PipelineSettings,
  now = Date.now(),
): DrainVerdict {
  const t = c.triage as {
    pakistanRelevance?: number
    newsworthiness?: number
    sourceCredibility?: number
    category?: string
    sensitivityFlags?: string[]
    decision?: string
    weightedScore?: number
  }
  const flags = [...new Set([...(t.sensitivityFlags ?? []), ...(c.review?.flags ?? [])])]
  const topic = majorGlobalTopic(c.headline, ...items.map((i) => i.title))
  const stored = typeof t.weightedScore === 'number' ? t.weightedScore : 0
  let score = stored
  if (typeof t.pakistanRelevance === 'number' && typeof t.newsworthiness === 'number' && typeof t.sourceCredibility === 'number') {
    score = computeWeightedScore(
      {
        pakistanRelevance: topic ? Math.max(t.pakistanRelevance, MAJOR_GLOBAL_RELEVANCE) : t.pakistanRelevance,
        newsworthiness: t.newsworthiness,
        sourceCredibility: t.sourceCredibility,
        category: (t.category ?? 'pakistan') as never,
      },
      settings,
    )
  }
  const reject = (reason: string): DrainVerdict => ({ action: 'reject', reason: `review drain: ${reason}`, score })

  if (/^QA failed/i.test(c.review?.reason ?? '')) return reject(`QA could not verify the draft against the sources (${(c.review?.reason ?? '').slice(0, 140)})`)
  if (flags.includes('unverified')) return reject('unverified claim, no credible outlet backs it')
  if (items.length && !hasFreshSource(items, now)) return reject('stale sources: no source from the last 18 hours')
  const opinion = opinionCue(items)
  if (opinion) return reject(opinion)
  if (t.decision === 'reject' && !topic) return reject(`the desk model rejected it (${score.toFixed(2)})`)
  if (c.maxTier >= 3 && c.distinctSources < 2 && !topic) return reject('a single tier-3 source and nothing credible backs it')
  const threshold = settings.thresholds?.review ?? DEFAULT_REVIEW
  if (score < threshold) return reject(`score ${score.toFixed(2)} is below the review threshold ${threshold}`)
  return { action: 'write', reason: `auto-approved after ${REVIEW_DRAIN_MIN} min in review (score ${score.toFixed(2)}${flags.length ? `, flags ${flags.join('/')}` : ''}${topic ? `, world story ${topic}` : ''})`, score }
}

/**
 * Decide every cluster that has sat in review for REVIEW_DRAIN_MIN minutes or more. Returns how many were sent to the
 * writer and how many were closed. Safe to run every few minutes: a decided cluster leaves `in_review`.
 */
export async function drainReviewQueue(
  deps: {
    payload: Pick<PayloadClient, 'reviewBacklog' | 'getCluster' | 'getSettings' | 'patchCluster' | 'patchReview'>
    writeQueue: Pick<Queue, 'add'>
  },
  now = Date.now(),
): Promise<{ written: number; rejected: number; waiting: number }> {
  const { clusters } = await deps.payload.reviewBacklog(REVIEW_DRAIN_MIN)
  if (!clusters.length) return { written: 0, rejected: 0, waiting: 0 }
  const settings = await deps.payload.getSettings().catch(() => ({}) as PipelineSettings)
  const writes: { c: ReviewBacklogCluster; verdict: DrainVerdict }[] = []
  let rejected = 0

  const decide = async (c: ReviewBacklogCluster, decision: 'approve' | 'reject') => {
    if (!c.review) return
    try {
      await deps.payload.patchReview(c.review.id, { decision, decidedBy: 'auto-drain' })
    } catch (e) {
      logger.warn({ clusterId: c.id, err: e instanceof Error ? e.message : e }, 'review drain: could not record the decision')
    }
  }

  for (const c of clusters) {
    try {
      // A person parked it on purpose
      if (c.review?.decision === 'hold') continue
      const detail = await deps.payload.getCluster(c.id)
      if (detail.status !== 'in_review' || detail.article) continue
      const triage = (detail.triage ?? c.triage ?? {}) as Record<string, unknown>
      let verdict: DrainVerdict
      if (c.review?.decision === 'reject') {
        verdict = { action: 'reject', reason: 'rejected by a reviewer', score: 0 }
      } else {
        verdict = decideStaleReview({ ...c, triage }, detail.items, settings, now)
      }
      if (verdict.action === 'reject') {
        await deps.payload.patchCluster(c.id, { status: 'rejected', triage: { ...triage, weightedScore: verdict.score, codeOutcome: 'reject', deferReason: verdict.reason } })
        await decide(c, 'reject')
        rejected++
        logger.info({ clusterId: c.id, reason: verdict.reason }, 'review drain: rejected')
      } else {
        writes.push({ c: { ...c, triage }, verdict })
      }
    } catch (e) {
      logger.warn({ clusterId: c.id, err: e instanceof Error ? e.message : e }, 'review drain: cluster skipped')
    }
  }

  writes.sort((a, b) => b.verdict.score - a.verdict.score)
  let written = 0
  for (const { c, verdict } of writes.slice(0, REVIEW_DRAIN_BATCH)) {
    try {
      const triage = c.triage
      const priority = triage.suggestedPriority === 'breaking' ? 1 : triage.suggestedPriority === 'high' ? 3 : 5
      await deps.payload.patchCluster(c.id, {
        status: 'writing',
        triage: {
          ...triage,
          weightedScore: verdict.score,
          codeOutcome: 'publish',
          // The review is over: no second wait at the editor gate, and the 8 h freshness grace applies
          editorApproved: true,
          editorApprovedAt: new Date(now).toISOString(),
          reviewDrain: verdict.reason,
        },
      })
      await deps.writeQueue.add('write', { clusterId: c.id }, { priority, jobId: `review-drain-${c.id}-${Math.floor(now / 3_600_000)}` })
      await decide(c, 'approve')
      written++
      logger.info({ clusterId: c.id, reason: verdict.reason }, 'review drain: approved, writing')
    } catch (e) {
      logger.warn({ clusterId: c.id, err: e instanceof Error ? e.message : e }, 'review drain: write failed to start')
    }
  }
  return { written, rejected, waiting: Math.max(0, writes.length - written) }
}
