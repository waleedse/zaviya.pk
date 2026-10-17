import { describe, expect, it } from 'vitest'
import { flashSlot, pickFlash, type FlashState } from './flash.js'
import type { ApiArticle } from './lib.js'
import { parseSlots } from './schedule.js'

// Saturday 17 Oct 2026, 15:00 PKT = 10:00 UTC
const NOW = Date.UTC(2026, 9, 17, 10, 0)
const slots = parseSlots('morning@07:40=headlines30,money@12:40/mon-sat=money45,ai@17:10/tue+thu+sat=topic60,evening@19:40=roundup60')
const art = (id: number, minsAgo: number, breaking = true): ApiArticle => ({
  id,
  title: `Story ${id}`,
  slug: `s-${id}`,
  category: { slug: 'pakistan' },
  heroImage: { url: `https://zaviya.pk/${id}.jpg` },
  isBreaking: breaking,
  priority: 'normal',
  publishedAt: new Date(NOW - minsAgo * 60_000).toISOString(),
})
const fresh: FlashState = { done: new Set(), countToday: 0, lastAt: 0 }

describe('pickFlash', () => {
  it('flashes the newest fresh breaking story', () => {
    expect(pickFlash([art(1, 30), art(2, 10), art(3, 5, false)], fresh, slots, NOW)).toEqual({ id: 2 })
  })
  it('ignores stale, already-flashed and non-breaking stories', () => {
    expect(pickFlash([art(1, 90), art(2, 10, false)], fresh, slots, NOW)).toMatchObject({ skip: 'no fresh breaking story' })
    expect(pickFlash([art(2, 10)], { ...fresh, done: new Set([2]) }, slots, NOW)).toMatchObject({ skip: expect.any(String) })
  })
  it('allows at most 2 a day, 3 h apart', () => {
    expect(pickFlash([art(2, 10)], { ...fresh, countToday: 2 }, slots, NOW)).toMatchObject({ skip: 'daily flash limit reached' })
    expect(pickFlash([art(2, 10)], { ...fresh, lastAt: NOW - 2 * 3600_000 }, slots, NOW)).toMatchObject({ skip: expect.stringContaining('3 h') })
    expect(pickFlash([art(2, 10)], { ...fresh, countToday: 1, lastAt: NOW - 4 * 3600_000 }, slots, NOW)).toEqual({ id: 2 })
  })
  it('stays away from scheduled videos, on the days they run', () => {
    // 17:00 PKT Saturday: the AI slot (17:10, Tue/Thu/Sat) is 10 min away
    const sat1700 = Date.UTC(2026, 9, 17, 12, 0)
    expect(pickFlash([{ ...art(2, 0), publishedAt: new Date(sat1700 - 600_000).toISOString() }], fresh, slots, sat1700)).toMatchObject({ skip: expect.stringContaining('"ai"') })
    // 17:00 PKT Friday: no AI slot that day
    const fri1700 = Date.UTC(2026, 9, 16, 12, 0)
    expect(pickFlash([{ ...art(2, 0), publishedAt: new Date(fri1700 - 600_000).toISOString() }], fresh, slots, fri1700)).toEqual({ id: 2 })
  })
})

describe('flashSlot', () => {
  it('is a one-off flash15 slot named after the story, timed now', () => {
    expect(flashSlot(77, NOW)).toMatchObject({ name: 'flash-77', hour: 15, minute: 0, format: 'flash15', days: '*' })
  })
})
