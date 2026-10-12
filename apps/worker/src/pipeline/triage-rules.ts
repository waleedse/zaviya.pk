import type { TriageResult } from '@zaviya/shared'
import { SITE } from '@zaviya/shared'
import type { PipelineSettings } from '../payload-client.js'

export type TriageOutcome = 'publish' | 'review' | 'reject' | 'defer'

export interface TriageContext {
  maxTier: 1 | 2 | 3
  distinctSources: number
  settings: PipelineSettings
  now?: Date
  lastPublishedAt?: string | null
  articlesPublishedToday?: number
}

export interface TriageDecision {
  outcome: TriageOutcome
  reason: string
  weightedScore: number
  modelDecision: TriageResult['decision']
  /** For `defer`: try triage again after this many ms (pacing, caps, publish window). */
  retryInMs?: number
}

/** Topics where a human must look before anything goes live. */
const HARD_FLAGS = new Set(['military', 'judiciary', 'religion', 'blasphemy', 'violence', 'death', 'minor', 'election'])

/** Desks where a thin-source code reject has repeatedly binned good Pakistan stories (ZAV-6). */
const PROTECTED_CATEGORIES = new Set(['cricket', 'education-jobs', 'business'])
/** Items that are only a scorecard or a photo caption are not worth a human's time. */
const LOW_VALUE_REASON = /\b(scorecard|live[- ]?score|photo caption)\b/i

const DEFAULT_PUBLISH = 0.72
const DEFAULT_REVIEW = 0.5

export function computeWeightedScore(
  triage: Pick<TriageResult, 'pakistanRelevance' | 'newsworthiness' | 'sourceCredibility' | 'category'>,
  settings: PipelineSettings,
): number {
  const base =
    0.4 * triage.pakistanRelevance +
    0.35 * triage.newsworthiness +
    0.25 * triage.sourceCredibility
  const weight = settings.categoryWeights?.[triage.category] ?? 1
  return base * weight
}

function pktParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: SITE.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return { hour, minute, minutesSinceMidnight: hour * 60 + minute }
}

function inPublishWindow(now: Date, settings: PipelineSettings): boolean {
  const start = settings.publishWindow?.start ?? '00:00'
  const end = settings.publishWindow?.end ?? '24:00'
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const { minutesSinceMidnight: m } = pktParts(now)
  const startM = (sh ?? 0) * 60 + (sm ?? 0)
  let endM = (eh ?? 24) * 60 + (em ?? 0)
  if (endM <= startM) endM += 24 * 60
  let cur = m
  if (cur < startM) cur += 24 * 60
  return cur >= startM && cur <= endM
}

function minutesSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 60_000
}

/** Code rules from ARCHITECTURE §6.3 — pure, testable. */
export function applyTriageRules(triage: TriageResult, ctx: TriageContext): TriageDecision {
  const now = ctx.now ?? new Date()
  const weightedScore = computeWeightedScore(triage, ctx.settings)
  const publishThreshold = ctx.settings.thresholds?.publish ?? DEFAULT_PUBLISH
  const reviewThreshold = ctx.settings.thresholds?.review ?? DEFAULT_REVIEW
  const isBreaking = triage.suggestedPriority === 'breaking'

  // A strong Pakistan cricket/jobs/business item that the model did not reject is never
  // binned by the source-count rules; it goes to the review queue instead.
  const protectedFromReject =
    triage.decision !== 'reject' &&
    PROTECTED_CATEGORIES.has(triage.category) &&
    triage.pakistanRelevance >= 0.8 &&
    weightedScore >= publishThreshold &&
    !LOW_VALUE_REASON.test(triage.reason ?? '')

  const hardFlags = triage.sensitivityFlags.filter((f) => HARD_FLAGS.has(f))
  if (hardFlags.length > 0) {
    return {
      outcome: 'review',
      reason: `Sensitivity flags: ${hardFlags.join(', ')}`,
      weightedScore,
      modelDecision: triage.decision,
    }
  }
  // "unverified" only blocks when nothing credible backs the story.
  if (triage.sensitivityFlags.includes('unverified') && ctx.maxTier === 3) {
    return {
      outcome: ctx.distinctSources >= 2 || protectedFromReject ? 'review' : 'reject',
      reason: 'Unverified claim with only low-tier sources',
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  if (ctx.maxTier === 3 && ctx.distinctSources < 2) {
    if (triage.newsworthiness > 0.85) {
      return {
        outcome: 'review',
        reason: 'Tier-3 only source but high newsworthiness — needs human review',
        weightedScore,
        modelDecision: triage.decision,
      }
    }
    return {
      outcome: protectedFromReject ? 'review' : 'reject',
      reason: protectedFromReject
        ? 'Strong Pakistan story on a thin source (tier 3, single source) — needs human review'
        : 'Insufficient source diversity (tier 3, single source)',
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  const dailyCap = ctx.settings.dailyCaps?.articles ?? ctx.settings.dailyCaps?.publish ?? 999
  const publishedToday = ctx.articlesPublishedToday ?? 0
  const wouldPublish = triage.decision !== 'reject' && weightedScore >= publishThreshold && triage.decision === 'publish'
  if (wouldPublish && !isBreaking && publishedToday >= dailyCap) {
    return {
      outcome: 'defer',
      reason: `Daily publish cap reached (${dailyCap})`,
      weightedScore,
      modelDecision: triage.decision,
      retryInMs: 60 * 60_000,
    }
  }

  const minInterval = ctx.settings.minIntervalMin ?? 45
  if (wouldPublish && !isBreaking && ctx.lastPublishedAt && minutesSince(ctx.lastPublishedAt, now) < minInterval) {
    const waitMin = minInterval - minutesSince(ctx.lastPublishedAt, now)
    return {
      outcome: 'defer',
      reason: `Minimum interval ${minInterval}m not met since last publish`,
      weightedScore,
      modelDecision: triage.decision,
      retryInMs: Math.ceil(waitMin * 60_000) + Math.floor(Math.random() * 5 * 60_000),
    }
  }

  if (wouldPublish && !isBreaking && !inPublishWindow(now, ctx.settings)) {
    return {
      outcome: 'defer',
      reason: 'Outside publish window (Asia/Karachi)',
      weightedScore,
      modelDecision: triage.decision,
      retryInMs: 30 * 60_000,
    }
  }

  if (triage.decision === 'reject') {
    return {
      outcome: 'reject',
      reason: triage.reason || 'Model rejected',
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  if (weightedScore >= publishThreshold && triage.decision === 'publish') {
    return {
      outcome: 'publish',
      reason: triage.reason || 'Score above publish threshold',
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  if (weightedScore >= reviewThreshold || triage.decision === 'review') {
    return {
      outcome: 'review',
      reason: triage.reason || 'Score in review band',
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  return {
    outcome: 'reject',
    reason: triage.reason || 'Score below review threshold',
    weightedScore,
    modelDecision: triage.decision,
  }
}
