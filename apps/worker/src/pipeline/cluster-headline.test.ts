import { describe, expect, it } from 'vitest'
import { pickClusterHeadline } from '@zaviya/shared'

describe('pickClusterHeadline (ZAV-148)', () => {
  it('replaces a stray first-item headline with the title the rest of the cluster agrees on', () => {
    const items = [
      { title: 'Week 5 inactives for Eagles', tier: 3 },
      { title: "Governor's rule, emergency enforced in KP after president's approval - ARYnews.tv", tier: 2 },
      { title: 'Governor’s rule and emergency imposed in KP — here’s what it means - Dawn', tier: 1 },
      { title: 'PTI challenges emergency, governor’s rule in KP at Peshawar High Court - Business Recorder', tier: 2 },
      { title: 'NA ratifies emergency in Khyber Pakhtunkhwa governor’s rule', tier: 2 },
    ]
    const h = pickClusterHeadline(items, 'Week 5 inactives for Eagles')
    expect(h).not.toMatch(/Eagles/)
    expect(h).toMatch(/governor/i)
  })
  it('keeps the existing headline for tiny clusters', () => {
    expect(pickClusterHeadline([{ title: 'A b c d' }, { title: 'Other thing here' }], 'First')).toBe('First')
  })
  it('keeps the existing headline when nothing overlaps', () => {
    const items = [{ title: 'alpha bravo charlie' }, { title: 'delta echo foxtrot' }, { title: 'golf hotel india' }]
    expect(pickClusterHeadline(items, 'alpha bravo charlie')).toBe('alpha bravo charlie')
  })
})
