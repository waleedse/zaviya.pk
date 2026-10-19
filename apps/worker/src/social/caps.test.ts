import { describe, expect, it } from 'vitest'
import { decideSlot, effectiveCap, inPeakWindow, pktDayStart } from './caps.js'

// 2026-10-19 PKT times, expressed in UTC (PKT = UTC+5)
const pkt = (h: number, m = 0) => Date.UTC(2026, 9, 19, h - 5, m)

describe('effectiveCap', () => {
  it('uses the lower of the setting and the ceiling', () => {
    expect(effectiveCap('facebook', { facebook: 15 })).toBe(8)
    expect(effectiveCap('instagram', { instagram: 3 })).toBe(3)
    expect(effectiveCap('x')).toBe(10)
  })
})

describe('pktDayStart', () => {
  it('rolls over at midnight PKT', () => {
    expect(pktDayStart(pkt(0, 30))).toBe(new Date(pkt(0)).toISOString())
    expect(pktDayStart(pkt(23, 59))).toBe(new Date(pkt(0)).toISOString())
  })
})

describe('inPeakWindow', () => {
  it('matches 08-10, 13-14 and 20-23 PKT', () => {
    expect(inPeakWindow(pkt(8))).toBe(true)
    expect(inPeakWindow(pkt(10))).toBe(false)
    expect(inPeakWindow(pkt(13, 30))).toBe(true)
    expect(inPeakWindow(pkt(22, 59))).toBe(true)
    expect(inPeakWindow(pkt(3))).toBe(false)
  })
})

describe('decideSlot', () => {
  const base = { platform: 'facebook' as const, priority: 'normal' as const, queuedAt: pkt(8), postedToday: 0 }
  it('does not send the 9th Facebook post of the day', () => {
    expect(decideSlot({ ...base, now: pkt(9), postedToday: 8 })).toMatchObject({ action: 'skip' })
    expect(decideSlot({ ...base, now: pkt(9), postedToday: 7 })).toEqual({ action: 'post' })
  })
  it('caps breaking news too', () => {
    expect(decideSlot({ ...base, priority: 'breaking', now: pkt(3), postedToday: 8 })).toMatchObject({ action: 'skip' })
    expect(decideSlot({ ...base, priority: 'breaking', now: pkt(3) })).toEqual({ action: 'post' })
  })
  it('delays a normal story outside the peak windows to the next one', () => {
    const d = decideSlot({ ...base, queuedAt: pkt(2), now: pkt(2) })
    expect(d).toMatchObject({ action: 'delay', until: pkt(8) })
  })
  it('keeps 45 minutes between posts on one platform', () => {
    const d = decideSlot({ ...base, now: pkt(8, 20), lastPostedAt: new Date(pkt(8, 10)).toISOString() })
    expect(d).toMatchObject({ action: 'delay', until: pkt(8, 55) })
  })
  it('moves to the next window when the gap ends after this one closes', () => {
    const d = decideSlot({ ...base, queuedAt: pkt(9), now: pkt(9, 40), lastPostedAt: new Date(pkt(9, 30)).toISOString() })
    expect(d).toMatchObject({ action: 'delay', until: pkt(13) })
  })
  it('posts in a window when the gap has passed', () => {
    expect(decideSlot({ ...base, now: pkt(9), lastPostedAt: new Date(pkt(8)).toISOString() })).toEqual({ action: 'post' })
  })
  it('skips stories that waited too long', () => {
    expect(decideSlot({ ...base, queuedAt: pkt(8) - 1, now: pkt(21), postedToday: 0 })).toMatchObject({ action: 'skip' })
  })
})
