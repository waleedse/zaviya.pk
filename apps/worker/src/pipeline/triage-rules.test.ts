import { describe, it, expect } from 'vitest'
import { applyTriageRules, computeWeightedScore } from './triage-rules.js'
import type { TriageResult } from '@zaviya/shared'

const baseTriage: TriageResult = {
  pakistanRelevance: 0.9,
  newsworthiness: 0.8,
  sourceCredibility: 0.7,
  category: 'pakistan',
  sensitivityFlags: [],
  isUpdateOfExisting: false,
  suggestedPriority: 'normal',
  decision: 'publish',
  reason: 'ok',
}

describe('applyTriageRules', () => {
  it('publishes global AI stories with no Pakistan angle', () => {
    const d = applyTriageRules(
      { ...baseTriage, category: 'ai', pakistanRelevance: 0, newsworthiness: 0.8, sourceCredibility: 0.8 },
      { maxTier: 1, distinctSources: 2, settings: {} },
    )
    expect(d.outcome).toBe('publish')
    const t = applyTriageRules(
      { ...baseTriage, category: 'ai', pakistanRelevance: 0, newsworthiness: 0.8, sourceCredibility: 0.8 },
      { maxTier: 3, distinctSources: 1, settings: {} },
    )
    expect(t.outcome).toBe('review')
  })

  it('does not hold a story for its topic: sensitivity flags no longer force review (13 Nov)', () => {
    for (const flag of ['military', 'judiciary', 'religion', 'blasphemy', 'violence', 'death', 'minor', 'election'] as const) {
      const d = applyTriageRules({ ...baseTriage, sensitivityFlags: [flag] }, { maxTier: 1, distinctSources: 3, settings: {} })
      expect(d.outcome).toBe('publish')
    }
  })

  it('rejects tier-3 single source unless high news', () => {
    const d = applyTriageRules(baseTriage, { maxTier: 3, distinctSources: 1, settings: {} })
    expect(d.outcome).toBe('reject')
    const r = applyTriageRules(
      { ...baseTriage, newsworthiness: 0.9 },
      { maxTier: 3, distinctSources: 1, settings: {} },
    )
    expect(r.outcome).toBe('review')
  })

  it('breaking bypasses interval but not sensitivity', () => {
    const now = new Date('2026-10-10T03:00:00.000Z')
    const d = applyTriageRules(
      { ...baseTriage, suggestedPriority: 'breaking' },
      {
        maxTier: 1,
        distinctSources: 2,
        settings: { minIntervalMin: 45, lastPublishedAt: now.toISOString() },
        now,
        lastPublishedAt: now.toISOString(),
      },
    )
    expect(d.outcome).toBe('publish')
  })

  it('defers (not reviews) a publishable story when the interval is not met', () => {
    const now = new Date('2026-10-10T10:00:00.000Z')
    const d = applyTriageRules(baseTriage, {
      maxTier: 2,
      distinctSources: 2,
      settings: { minIntervalMin: 20 },
      now,
      lastPublishedAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    })
    expect(d.outcome).toBe('defer')
    // The interval is capped at 10 minutes (6 stories an hour), so 5 minutes in leaves 5
    expect(d.retryInMs).toBeGreaterThanOrEqual(5 * 60_000)
    expect(d.retryInMs).toBeLessThan(11 * 60_000)
  })

  it('ZAV-237: the daily cap holds a normal story but not an overdue Jobs/AI desk', () => {
    const ctx = { maxTier: 1 as const, distinctSources: 3, settings: { dailyCaps: { articles: 120 } }, articlesPublishedToday: 130 }
    expect(applyTriageRules(baseTriage, ctx).outcome).toBe('defer')
    expect(applyTriageRules({ ...baseTriage, category: 'education-jobs' }, { ...ctx, quotaOverdue: true }).outcome).toBe('defer')
    const ok = { ...ctx, settings: { dailyCaps: { articles: 40 } }, articlesPublishedToday: 41 }
    expect(applyTriageRules({ ...baseTriage, category: 'education-jobs' }, { ...ok, quotaOverdue: true }).outcome).toBe('publish')
    expect(applyTriageRules({ ...baseTriage, category: 'education-jobs' }, { ...ok, articlesPublishedToday: 46, quotaOverdue: true }).outcome).toBe('defer')
    expect(applyTriageRules({ ...baseTriage, suggestedPriority: 'breaking' }, { ...ok, articlesPublishedToday: 60 }).outcome).toBe('publish')
  })

  it('6 Nov: spreads the cap over the PKT day and defers with a retry', () => {
    // 00:30 PKT = 19:30Z the day before; 14 stories already out (the night flood)
    const night = new Date('2026-11-05T19:30:00.000Z')
    const d = applyTriageRules(baseTriage, { maxTier: 1, distinctSources: 3, settings: {}, now: night, articlesPublishedToday: 14 })
    expect(d.outcome).toBe('defer')
    expect(d.reason).toMatch(/pace/)
    expect(d.retryInMs).toBeGreaterThanOrEqual(10 * 60_000)
    // 10:00 PKT with 15 out is on pace
    const morning = new Date('2026-11-06T05:00:00.000Z')
    const ctx = { maxTier: 1 as const, distinctSources: 3, settings: {}, now: morning }
    expect(applyTriageRules(baseTriage, { ...ctx, articlesPublishedToday: 15 }).outcome).toBe('publish')
  })

  it('does not block on "unverified" when credible sources exist', () => {
    const d = applyTriageRules({ ...baseTriage, sensitivityFlags: ['unverified'] }, { maxTier: 2, distinctSources: 1, settings: {} })
    expect(d.outcome).toBe('publish')
    const r = applyTriageRules({ ...baseTriage, sensitivityFlags: ['unverified'] }, { maxTier: 3, distinctSources: 1, settings: {} })
    expect(r.outcome).toBe('reject')
  })

  it('does not let a low desk weight hold back a story that is trending on Google in Pakistan', () => {
    const settings = { categoryWeights: { cricket: 0.6 } }
    const t = { ...baseTriage, category: 'cricket' as const, pakistanRelevance: 0.9, newsworthiness: 0.8, sourceCredibility: 0.8 }
    const plain = applyTriageRules(t, { maxTier: 1, distinctSources: 2, settings })
    const trending = applyTriageRules(t, { maxTier: 1, distinctSources: 2, settings, trendsHit: true })
    expect(trending.weightedScore).toBeGreaterThan(plain.weightedScore)
    expect(trending.weightedScore).toBeCloseTo(0.4 * 0.9 + 0.35 * 0.8 + 0.25 * 0.8)
  })

  it('computes weighted score with category weight', () => {
    const s = computeWeightedScore(baseTriage, { categoryWeights: { pakistan: 0.5 } })
    expect(s).toBeCloseTo((0.4 * 0.9 + 0.35 * 0.8 + 0.25 * 0.7) * 0.5)
  })

  describe('ZAV-6: strong Pakistan stories are not code-rejected', () => {
    const thin = { maxTier: 3 as const, distinctSources: 1, settings: {} }

    it('keeps a Pakistan cricket preview (cluster 1079) in review', () => {
      const d = applyTriageRules({ ...baseTriage, category: 'cricket', pakistanRelevance: 1, newsworthiness: 0.8, sourceCredibility: 0.8 }, thin)
      expect(d.outcome).toBe('review')
    })

    it('keeps Pakistan jobs (cluster 1182) and business in review', () => {
      expect(applyTriageRules({ ...baseTriage, category: 'education-jobs' }, thin).outcome).toBe('review')
      expect(applyTriageRules({ ...baseTriage, category: 'business' }, thin).outcome).toBe('review')
    })

    it('keeps an unverified-flag jobs item in review', () => {
      const d = applyTriageRules({ ...baseTriage, category: 'education-jobs', sensitivityFlags: ['unverified'] }, thin)
      expect(d.outcome).toBe('review')
    })

    it('still rejects scorecard-only items, model rejects and low scores', () => {
      expect(applyTriageRules({ ...baseTriage, category: 'cricket', reason: 'Live score page only' }, thin).outcome).toBe('reject')
      expect(applyTriageRules({ ...baseTriage, category: 'cricket', decision: 'reject' }, thin).outcome).toBe('reject')
      expect(applyTriageRules({ ...baseTriage, category: 'cricket', newsworthiness: 0.2, sourceCredibility: 0.3 }, thin).outcome).toBe('reject')
    })

    it('never returns reject for a review codeOutcome path: sensitive flags stay review', () => {
      const d = applyTriageRules({ ...baseTriage, category: 'cricket', sensitivityFlags: ['death'] }, thin)
      expect(d.outcome).toBe('review')
    })
  })
})

describe('daily article cap (5 Nov)', () => {
  it('defaults to 40 when Settings has no articles cap', async () => {
    const { dailyArticleCap, DEFAULT_DAILY_ARTICLE_CAP } = await import('./triage-rules.js')
    expect(DEFAULT_DAILY_ARTICLE_CAP).toBe(40)
    expect(dailyArticleCap({ dailyCaps: { facebook: 15 } })).toBe(40)
    expect(dailyArticleCap({})).toBe(40)
    expect(dailyArticleCap({ dailyCaps: { articles: 60 } })).toBe(60)
  })
})

describe('dailyAllowance (6 Nov pacing)', () => {
  it('grows through the PKT day, is slow overnight and never passes the cap', async () => {
    const { dailyAllowance, capSlotWaitMs } = await import('./triage-rules.js')
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 5, h - 5, m)) // PKT is UTC+5
    expect(dailyAllowance(40, at(0, 0))).toBe(2)
    expect(dailyAllowance(40, at(5, 0))).toBe(12)
    expect(dailyAllowance(40, at(7, 0))).toBe(18)
    expect(dailyAllowance(40, at(12, 0))).toBe(ceil(40 * 780 / 1440) + 4)
    expect(dailyAllowance(40, at(23, 59))).toBe(40)
    expect(capSlotWaitMs(5, 40, at(12))).toBe(0)
    expect(capSlotWaitMs(40, 40, at(12))).toBe(60 * 60_000)
    expect(capSlotWaitMs(26, 40, at(12))).toBeGreaterThanOrEqual(10 * 60_000)
  })
})
function ceil(n: number) { return Math.ceil(n) }
