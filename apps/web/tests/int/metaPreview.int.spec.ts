import { describe, expect, it } from 'vitest'
import { classifySource } from '../../src/lib/analytics'
import { isMetaIp } from '../../src/lib/ip-ranges'
import { BURST_MIN_HITS, DROP_MEMORY_MS, createBurstTracker, createDropTracker, ipPrefix, isMetaPreviewCandidate } from '../../src/lib/meta-preview'

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

  describe('lone facebook+US follower after a Meta drop (2 Nov leaks)', () => {
    // judge() mirrors the route: a facebook+US hit is dropped on a burst or when a Meta drop happened on the path within 60 s
    const judge = (b: ReturnType<typeof createBurstTracker>, d: ReturnType<typeof createDropTracker>, p: string, country: string, at: number) => {
      if (!isMetaPreviewCandidate('facebook', country)) return 'kept'
      b.note(p, at)
      if (b.isBurst(p, at) || d.hasRecent(p, at)) {
        d.note(p, at)
        return 'dropped'
      }
      return 'kept'
    }
    const t0 = Date.parse('2026-11-02T06:37:59Z')

    it('drops the follower 5 s after two meta-ip drops and a meta-preview drop (11:37:59 - 11:38:05 PKT)', () => {
      const b = createBurstTracker()
      const d = createDropTracker()
      const p = '/education-jobs/pmf-opens-17-paramedical-diploma-courses-punjab'
      d.note(p, t0)
      d.note(p, t0 + 100)
      d.note(p, t0 + 1_000) // the meta-preview drop
      expect(judge(b, d, p, 'US', t0 + 6_000)).toBe('dropped')
    })

    it('drops the follower 3 s after one meta-ip drop (13:01:20 - 13:01:23 PKT)', () => {
      const b = createBurstTracker()
      const d = createDropTracker()
      const p = '/pakistan/peeda-act-probe-ex-auqaf-secretary-bukhari-neela-gumbad'
      d.note(p, t0)
      expect(judge(b, d, p, 'US', t0 + 3_000)).toBe('dropped')
    })

    it('drops the follower 29 s after one meta-ip drop (21:30:36 - 21:31:05 PKT) but not after the memory expires', () => {
      const b = createBurstTracker()
      const d = createDropTracker()
      const p = '/world/pakistan-assumes-g-24-chairmanship-aurangzeb-priorities'
      d.note(p, t0)
      expect(judge(b, d, p, 'US', t0 + 29_000)).toBe('dropped')
      const d2 = createDropTracker()
      d2.note(p, t0)
      expect(judge(createBurstTracker(), d2, p, 'US', t0 + DROP_MEMORY_MS + 1)).toBe('kept')
    })

    it('keeps PK readers and other countries, and US hits on a path with no recent Meta drop', () => {
      const b = createBurstTracker()
      const d = createDropTracker()
      d.note('/a', t0)
      expect(judge(b, d, '/a', 'PK', t0 + 3_000)).toBe('kept')
      expect(judge(b, d, '/a', 'GB', t0 + 3_000)).toBe('kept')
      expect(judge(b, d, '/b', 'US', t0 + 3_000)).toBe('kept')
    })
  })
})
