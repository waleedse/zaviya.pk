import type { TriageResult } from '@zaviya/shared'
import { SITE } from '@zaviya/shared'
import type { PipelineSettings } from '../payload-client.js'
import { applyGlobalTopic, type GlobalTopic } from './global-news.js'

export type TriageOutcome = 'publish' | 'review' | 'reject' | 'defer'

export interface TriageContext {
  maxTier: 1 | 2 | 3
  distinctSources: number
  settings: PipelineSettings
  now?: Date
  lastPublishedAt?: string | null
  articlesPublishedToday?: number
  /** ZAV-237: the story's desk (ai, education-jobs) has had no story for 4 h; the daily cap must not hold it back. */
  quotaOverdue?: boolean
  /** ZAV-301: the cluster is about a major world story Pakistanis follow (US-Iran, US elections, Gulf, crypto hack...): relevance is floored */
  globalTopic?: GlobalTopic | null
  /** ZAV-301: a Google Trends PK item is in the cluster; a lone tier-3 trend hit on a major world story goes to review, not reject */
  trendsHit?: boolean
}

export interface TriageDecision {
  outcome: TriageOutcome
  reason: string
  weightedScore: number
  modelDecision: TriageResult['decision']
  /** For `defer`: try triage again after this many ms (pacing, caps, publish window). */
  retryInMs?: number
}


/** Desks where a thin-source code reject has repeatedly binned good Pakistan stories (ZAV-6). */
/**
 * The publishing gap in minutes: Settings.minIntervalMin, never more than this ceiling. 10 minutes
 * since 24 Oct (ZAV-201: 15-20 clusters waited at decision publish while the day was at 89 of 96); was 15
 * since 16 Oct. Revert by setting it back to 15. Breaking news ignores the gap.
 */
export const MAX_PUBLISH_INTERVAL_MIN = 10

/**
 * Stories a day when Settings has no articles cap (Waleed, 5 Nov 2026: quality over volume).
 * Google stopped showing the site on 16 Oct while it published ~150 rewrites a day; ~40 strong
 * stories a day is the new ceiling. Breaking news still goes out.
 */
export const DEFAULT_DAILY_ARTICLE_CAP = 40
export function dailyArticleCap(settings: { dailyCaps?: Record<string, number | null | undefined> | null }): number {
  return settings.dailyCaps?.articles ?? settings.dailyCaps?.publish ?? DEFAULT_DAILY_ARTICLE_CAP
}
/** Extra stories the schedule allows ahead of the clock, so a good hour is not starved. */
export const CAP_BURST = 4
/** The cap-exempt desk (quotaOverdue) may add at most this many stories beyond the daily cap. */
export const QUOTA_EXTRA_PER_DAY = 6
/** Quiet hours in PKT: almost nobody reads, so at most OVERNIGHT_PER_HOUR stories an hour. */
export const OVERNIGHT_END_MIN = 7 * 60
export const OVERNIGHT_PER_HOUR = 2

/**
 * How many normal stories may have gone out by now (PKT): the cap spread over the day with one
 * hour of head start and a small burst, never above the cap. 00:00-07:00 PKT is limited to
 * OVERNIGHT_PER_HOUR an hour so the cap is not spent while nobody reads (6 Nov: 38 of 56 stories
 * went out before 05:00).
 */
export function dailyAllowance(cap: number, now: Date): number {
  const { minutesSinceMidnight: m } = pktParts(now)
  let allowance = Math.ceil((cap * (m + 60)) / 1440) + CAP_BURST
  if (m < OVERNIGHT_END_MIN) allowance = Math.min(allowance, OVERNIGHT_PER_HOUR * (Math.floor(m / 60) + 1))
  return Math.min(cap, allowance)
}

/** 0 when a normal story may publish now; else ms until the allowance next grows (10 to 60 minutes). */
export function capSlotWaitMs(published: number, cap: number, now: Date): number {
  if (published < dailyAllowance(cap, now)) return 0
  for (let step = 5; step <= 60; step += 5) {
    if (published < dailyAllowance(cap, new Date(now.getTime() + step * 60_000))) return Math.max(step, 10) * 60_000
  }
  return 60 * 60_000
}

export function effectiveIntervalMin(settings: { minIntervalMin?: number }): number {
  return Math.min(settings.minIntervalMin ?? MAX_PUBLISH_INTERVAL_MIN, MAX_PUBLISH_INTERVAL_MIN)
}

const PROTECTED_CATEGORIES = new Set(['cricket', 'education-jobs', 'business', 'ai'])
/** Desks that run global stories with no Pakistan angle (ZAV-83); relevance is floored for scoring. */
const GLOBAL_DESKS = new Set(['ai'])
const GLOBAL_DESK_RELEVANCE = 0.8
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
export function applyTriageRules(rawTriage: TriageResult, ctx: TriageContext): TriageDecision {
  const deskTriage = GLOBAL_DESKS.has(rawTriage.category)
    ? { ...rawTriage, pakistanRelevance: Math.max(rawTriage.pakistanRelevance, GLOBAL_DESK_RELEVANCE) }
    : rawTriage
  const triage = applyGlobalTopic(deskTriage, ctx.globalTopic ?? null)
  const now = ctx.now ?? new Date()
  // A desk's learned weight reflects its usual readers; a story Pakistanis are searching right now (Google Trends PK)
  // is never held below its plain score by that (12 Nov: cricket fell to 0.6 while "pakistan vs bangladesh" had 10K+).
  const weightedScore = ctx.trendsHit
    ? Math.max(computeWeightedScore(triage, ctx.settings), computeWeightedScore(triage, {}))
    : computeWeightedScore(triage, ctx.settings)
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

  // 13 Nov (Waleed): no story is held, reviewed or rejected for its topic. The sensitivity flags (military, judiciary, religion,
  // blasphemy, violence, death, minor, election) stay on the verdict as information; the score, credibility and fact checks decide.
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
    if (triage.newsworthiness > 0.85 || (ctx.globalTopic && ctx.trendsHit)) {
      return {
        outcome: 'review',
        reason: ctx.globalTopic && ctx.trendsHit && triage.newsworthiness <= 0.85
          ? `Trending world story (${ctx.globalTopic}) seen only on Google Trends — a readable outlet must back it before it is written`
          : 'Tier-3 only source but high newsworthiness — needs human review',
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

  const dailyCap = dailyArticleCap(ctx.settings)
  const publishedToday = ctx.articlesPublishedToday ?? 0
  const wouldPublish = triage.decision !== 'reject' && weightedScore >= publishThreshold && triage.decision === 'publish'
  // Normal stories follow the day's schedule; the overdue desk may use the hard cap plus a few extras; breaking is exempt.
  const capSlotWait = capSlotWaitMs(publishedToday, dailyCap, now)
  const overBudget = ctx.quotaOverdue ? publishedToday >= dailyCap + QUOTA_EXTRA_PER_DAY : capSlotWait > 0
  if (wouldPublish && !isBreaking && overBudget) {
    return {
      outcome: 'defer',
      reason: `Daily publish pace reached (${publishedToday} of ${dailyAllowance(dailyCap, now)} allowed by now, cap ${dailyCap})`,
      weightedScore,
      modelDecision: triage.decision,
      retryInMs: ctx.quotaOverdue ? 60 * 60_000 : capSlotWait + Math.floor(Math.random() * 3 * 60_000),
    }
  }

  const minInterval = effectiveIntervalMin(ctx.settings)
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
