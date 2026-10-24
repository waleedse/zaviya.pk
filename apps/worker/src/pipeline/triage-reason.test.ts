import { describe, it, expect } from 'vitest'
import { TriageResultSchema, repetitionCutoff, tidyReason, REASON_LOOP_MARK } from '@zaviya/shared'

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

describe('repetition loops in the reason (ZAV-200)', () => {
  it('detects and cuts the loops seen in production', () => {
    expect(repetitionCutoff('Single source. a-priori-a-priori-a-priori-a-priori-a-priori')).not.toBeNull()
    expect(tidyReason('Weak. Tier 2 source. Tier 2 source. Tier 2 source. Tier 2 source. Tier 2 sou')).toBe(`Weak. Tier 2 source.${REASON_LOOP_MARK}`)
    expect(tidyReason('The claim depends on the ability to ability to ability to ability to')).toContain('ability to.')
    expect(repetitionCutoff('**list_of** list of list of list of list of')).not.toBeNull()
  })
  it('leaves ordinary reasons alone', () => {
    const ok = 'Two tier-1 outlets confirm the SBP cut; fresh and concrete, no sensitivity.'
    expect(repetitionCutoff(ok)).toBeNull()
    expect(tidyReason(ok)).toBe(ok)
    expect(repetitionCutoff('No no, that is a very very good result')).toBeNull()
  })
  it('the schema cuts a looping reason instead of keeping 400 characters of it', () => {
    const r = TriageResultSchema.parse({ ...base, reason: `Fine. ${'ability to '.repeat(60)}` })
    expect(r.reason.length).toBeLessThan(120)
    expect(r.reason).toContain('repeated itself')
  })
})
