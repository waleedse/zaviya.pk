import type { TriageResult } from '@zaviya/shared'
import { SITE } from '@zaviya/shared'
import type { PipelineSettings } from '../payload-client.js'

export type TriageOutcome = 'publish' | 'review' | 'reject'

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
}

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
  const start = settings.publishWindow?.start ?? '08:00'
  const end = settings.publishWindow?.end ?? '24:00'
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const { minutesSinceMidnight: m } = pktParts(now)
  const startM = (sh ?? 8) * 60 + (sm ?? 0)
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

  if (triage.sensitivityFlags.length > 0) {
    return {
      outcome: 'review',
      reason: `Sensitivity flags: ${triage.sensitivityFlags.join(', ')}`,
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
      outcome: 'reject',
      reason: 'Insufficient source diversity (tier 3, single source)',
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  const dailyCap = ctx.settings.dailyCaps?.articles ?? ctx.settings.dailyCaps?.publish ?? 999
  const publishedToday = ctx.articlesPublishedToday ?? 0
  if (!isBreaking && publishedToday >= dailyCap) {
    return {
      outcome: 'review',
      reason: `Daily publish cap reached (${dailyCap})`,
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  const minInterval = ctx.settings.minIntervalMin ?? 45
  if (!isBreaking && ctx.lastPublishedAt && minutesSince(ctx.lastPublishedAt, now) < minInterval) {
    return {
      outcome: 'review',
      reason: `Minimum interval ${minInterval}m not met since last publish`,
      weightedScore,
      modelDecision: triage.decision,
    }
  }

  if (!isBreaking && !inPublishWindow(now, ctx.settings)) {
    return {
      outcome: 'review',
      reason: 'Outside publish window (Asia/Karachi)',
      weightedScore,
      modelDecision: triage.decision,
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
