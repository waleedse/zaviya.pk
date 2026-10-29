import { describe, it, expect } from 'vitest'
import {
  clusterMatchCutoffs,
  MAX_CLUSTER_AGE_HOURS,
  MAX_REJECTED_CLUSTER_AGE_HOURS,
} from '../../src/endpoints/pipeline/clusterMatch'

describe('clusterMatchCutoffs', () => {
  it('rejected clusters stop absorbing sooner than live ones', () => {
    const now = Date.parse('2026-10-29T12:00:00Z')
    const c = clusterMatchCutoffs(now)
    expect(now - Date.parse(c.anyFirstSeen)).toBe(MAX_CLUSTER_AGE_HOURS * 3600_000)
    expect(now - Date.parse(c.rejectedFirstSeen)).toBe(MAX_REJECTED_CLUSTER_AGE_HOURS * 3600_000)
    expect(c.rejectedFirstSeen > c.anyFirstSeen).toBe(true)
  })
})
