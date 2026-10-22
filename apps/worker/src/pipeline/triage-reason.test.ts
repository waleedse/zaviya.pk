import { describe, it, expect } from 'vitest'
import { TriageResultSchema } from '@zaviya/shared'

const base = {
  pakistanRelevance: 0.8,
  newsworthiness: 0.7,
  sourceCredibility: 0.9,
  category: 'pakistan',
  sensitivityFlags: [],
  isUpdateOfExisting: false,
  suggestedPriority: 'normal',
  decision: 'publish',
}

describe('TriageResultSchema reason', () => {
  it('cuts an over-long reason instead of failing the verdict', () => {
    const r = TriageResultSchema.parse({ ...base, reason: 'x'.repeat(900) })
    expect(r.reason).toHaveLength(400)
  })
  it('keeps a short reason as is', () => {
    expect(TriageResultSchema.parse({ ...base, reason: 'ok' }).reason).toBe('ok')
  })
})
