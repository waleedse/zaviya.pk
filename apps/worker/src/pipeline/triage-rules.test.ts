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

  it('computes weighted score with category weight', () => {
    const s = computeWeightedScore(baseTriage, { categoryWeights: { pakistan: 0.5 } })
    expect(s).toBeCloseTo((0.4 * 0.9 + 0.35 * 0.8 + 0.25 * 0.7) * 0.5)
  })
})
