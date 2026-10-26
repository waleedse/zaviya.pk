import { describe, expect, it } from 'vitest'
import { parsePlan } from '../../src/lib/front-page'

describe('parsePlan', () => {
  it('accepts lead and seconds only', () => {
    expect(parsePlan({ lead: { id: 1788 }, seconds: [{ id: 1816 }] })).toEqual({ lead: { id: 1788 }, seconds: [{ id: 1816 }] })
  })

  it('treats a world-cricket pin key as the cricket pins instead of failing the whole plan', () => {
    expect(parsePlan({ pins: { 'world-cricket': [{ id: 1788 }] } }).pins).toEqual({ cricket: [{ id: 1788 }] })
  })

  it('still rejects unknown pin sections with a readable message', () => {
    expect(() => parsePlan({ pins: { sport: [{ id: 1 }] } })).toThrow('pins.sport: unknown section')
  })
})
