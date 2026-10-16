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
  it('sends sensitive stories to review', () => {
    const d = applyTriageRules(
      { ...baseTriage, sensitivityFlags: ['military'] },
      { maxTier: 1, distinctSources: 3, settings: {} },
    )
    expect(d.outcome).toBe('review')
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
    // The interval is capped at 15 minutes (4 stories an hour), so 5 minutes in leaves 10
    expect(d.retryInMs).toBeGreaterThanOrEqual(10 * 60_000)
    expect(d.retryInMs).toBeLessThan(16 * 60_000)
  })

  it('does not block on "unverified" when credible sources exist', () => {
    const d = applyTriageRules({ ...baseTriage, sensitivityFlags: ['unverified'] }, { maxTier: 2, distinctSources: 1, settings: {} })
    expect(d.outcome).toBe('publish')
    const r = applyTriageRules({ ...baseTriage, sensitivityFlags: ['unverified'] }, { maxTier: 3, distinctSources: 1, settings: {} })
    expect(r.outcome).toBe('reject')
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
