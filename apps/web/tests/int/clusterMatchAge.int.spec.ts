import { describe, it, expect } from 'vitest'
import {
  clusterMatchCutoffs,
  clusterAcceptsItems,
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

describe('clusterAcceptsItems (ZAV-252, cluster 14707 fixture)', () => {
  const now = Date.parse('2026-10-29T15:00:00Z')
  const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString()

  it('a rejected soft-politics cluster 10 h old no longer absorbs the sentencing verdict', () => {
    expect(clusterAcceptsItems({ status: 'rejected', firstSeenAt: iso(10) }, now)).toBe(false)
  })
  it('a rejected cluster still absorbs early stragglers', () => {
    expect(clusterAcceptsItems({ status: 'rejected', firstSeenAt: iso(2) }, now)).toBe(true)
  })
  it('live clusters keep absorbing updates for 72 h, then stop', () => {
    expect(clusterAcceptsItems({ status: 'published', firstSeenAt: iso(40) }, now)).toBe(true)
    expect(clusterAcceptsItems({ status: 'published', firstSeenAt: iso(80) }, now)).toBe(false)
  })
})
