import { describe, expect, it } from 'vitest'
import { classifySource } from '../../src/lib/analytics'
import { isMetaIp } from '../../src/lib/ip-ranges'
import { BURST_MIN_HITS, createBurstTracker, ipPrefix, isMetaPreviewCandidate } from '../../src/lib/meta-preview'

describe('Meta preview burst (ZAV-290)', () => {
  const path = '/pakistan/iesco-power-suspension-schedule-tuesday-feeders'

  it('only facebook-sourced hits from the US are suspects', () => {
    const fb = classifySource('http://m.facebook.com', undefined, 'zaviya.pk')
    expect(fb).toBe('facebook')
    expect(isMetaPreviewCandidate(fb, 'US')).toBe(true)
    expect(isMetaPreviewCandidate(fb, 'us')).toBe(true)
    expect(isMetaPreviewCandidate(fb, 'PK')).toBe(false)
    expect(isMetaPreviewCandidate(fb, undefined)).toBe(false)
    expect(isMetaPreviewCandidate('google', 'US')).toBe(false)
  })

  it('flags a burst of 3+ hits on one path within 5 s', () => {
    const t = createBurstTracker()
    t.note(path, 1_000)
    t.note(path, 1_400)
    expect(t.isBurst(path, 1_500)).toBe(false)
    t.note(path, 2_800)
    expect(t.count(path, 3_000)).toBe(BURST_MIN_HITS)
    expect(t.isBurst(path, 3_000)).toBe(true)
  })

  it('catches the 6-hit burst of 2 Nov 09:59:26 PKT but not a lone reader on another path', () => {
    const t = createBurstTracker()
    for (let i = 0; i < 6; i++) t.note(path, 10_000 + i * 150)
    expect(t.isBurst(path, 12_000)).toBe(true) // each of the six judges itself after the 2 s settle
    t.note('/business/some-other-story', 12_100)
    expect(t.isBurst('/business/some-other-story', 14_100)).toBe(false) // a single US reader on another path
  })

  it('does not count slow trickles or other paths', () => {
    const t = createBurstTracker()
    t.note(path, 0)
    t.note(path, 4_000)
    t.note(path, 8_000)
    expect(t.isBurst(path, 8_000)).toBe(false)
    t.note('/a', 8_000)
    t.note('/b', 8_000)
    expect(t.isBurst(path, 8_100)).toBe(false)
  })

  it('forgets old hits and stays bounded', () => {
    const t = createBurstTracker()
    for (let i = 0; i < 2_000; i++) t.note(`/p${i}`, i * 10_000)
    t.note(path, 0)
    expect(t.count('/p0', 100_000)).toBe(0)
  })

  it('logs a coarse prefix, never the full address', () => {
    expect(ipPrefix('34.12.7.99')).toBe('34.12.7.0/24')
    expect(ipPrefix('2a03:2880:f12f:83::1')).toBe('2a03:2880:f12f::/48')
    expect(ipPrefix('')).toBe('?')
  })

  it('knows the Meta prefixes added on 2 Nov', () => {
    expect(isMetaIp('57.145.16.20')).toBe(true)
    expect(isMetaIp('2a03:2880:f388::1')).toBe(true)
    expect(isMetaIp('39.32.10.20')).toBe(false)
  })
})
