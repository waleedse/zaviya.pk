import { describe, expect, it } from 'vitest'
import { checkHeap, checkProbe, freshState, GRACE_MS, guardEnabled, HEAP_STRIKES, PROBE_STRIKES } from '../../src/lib/heap-guard'

const LIMIT = 2096 * 1048576
const used = (pct: number) => Math.round((LIMIT * pct) / 100)
const later = GRACE_MS + 60_000

describe('heap guard (ZAV-169)', () => {
  it('stays quiet at normal heap use, even for a long time', () => {
    let s = freshState()
    for (let i = 0; i < 100; i++) {
      const r = checkHeap(s, used(40), LIMIT, later)
      expect(r.exit).toBeNull()
      s = r.state
    }
  })

  it('exits only after the heap stays above 85% for HEAP_STRIKES checks in a row', () => {
    let s = freshState()
    for (let i = 1; i < HEAP_STRIKES; i++) {
      const r = checkHeap(s, used(92), LIMIT, later)
      expect(r.exit).toBeNull()
      s = r.state
    }
    expect(checkHeap(s, used(92), LIMIT, later).exit).toMatch(/heap at 92%/)
  })

  it('a dip below the threshold resets the count (a busy moment is not a leak)', () => {
    let s = freshState()
    for (let i = 0; i < HEAP_STRIKES - 1; i++) s = checkHeap(s, used(95), LIMIT, later).state
    s = checkHeap(s, used(60), LIMIT, later).state
    expect(s.heapStrikes).toBe(0)
    expect(checkHeap(s, used(95), LIMIT, later).exit).toBeNull()
  })

  it('never exits in the first minutes after boot (no restart loop)', () => {
    let s = freshState()
    for (let i = 0; i < HEAP_STRIKES + 5; i++) {
      const r = checkHeap(s, used(99), LIMIT, 60_000)
      expect(r.exit).toBeNull()
      s = r.state
    }
  })

  it('exits after PROBE_STRIKES failed Payload reads in a row, and a good read resets', () => {
    let s = freshState()
    for (let i = 1; i < PROBE_STRIKES; i++) s = checkProbe(s, false, later).state
    expect(checkProbe(s, true, later).state.probeStrikes).toBe(0)
    expect(checkProbe(s, false, later).exit).toMatch(/Payload read/)
    expect(checkProbe(s, false, 30_000).exit).toBeNull()
  })

  it('HEAP_GUARD=off disables it', () => {
    expect(guardEnabled({ HEAP_GUARD: 'off' })).toBe(false)
    expect(guardEnabled({})).toBe(true)
  })
})
