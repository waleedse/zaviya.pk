import { describe, expect, it } from 'vitest'
import { DEFAULT_SLOTS, editionKey, hhmm, karachiDate, parseSlots, postAtMs, repeatFor, schedulerId, slotTimeMs, staleSchedulers } from './schedule.js'

describe('parseSlots', () => {
  it('has the two default slots', () => {
    const s = parseSlots(undefined)
    expect(s.map((x) => [x.name, x.hour, x.minute, x.format, x.edition])).toEqual([
      ['morning', 7, 40, 'headlines30', 'morning'],
      ['evening', 19, 40, 'roundup60', 'evening'],
    ])
    expect(parseSlots('')).toEqual(parseSlots(DEFAULT_SLOTS))
  })
  it('parses custom slots with a topic', () => {
    const s = parseSlots('ai@12:05=topic60:ai-tech, cash@09:00=money45')
    expect(s[0]).toMatchObject({ name: 'ai', hour: 12, minute: 5, format: 'topic60', topic: 'ai-tech' })
    expect(s[1]).toMatchObject({ name: 'cash', format: 'money45', topic: 'money' })
  })
  it('rejects bad entries loudly', () => {
    expect(() => parseSlots('morning@25:00=headlines30')).toThrow()
    expect(() => parseSlots('morning@07:40=nope')).toThrow(/unknown format/)
    expect(() => parseSlots('morning=headlines30')).toThrow(/bad VIDEO_SLOTS/)
    expect(() => parseSlots('a@07:40=headlines30,a@08:00=flash15')).toThrow(/duplicate/)
    expect(() => parseSlots('a@07:40=topic60:weird')).toThrow(/unknown topic/)
  })
})

describe('scheduler options', () => {
  const [morning] = parseSlots(undefined)
  it('uses a daily cron in Karachi time', () => {
    expect(repeatFor(morning!)).toEqual({ pattern: '40 7 * * *', tz: 'Asia/Karachi' })
    expect(schedulerId(morning!)).toBe('video-morning')
  })
  it('removes only video schedulers that are no longer configured', () => {
    expect(staleSchedulers(['video-morning', 'video-evening', 'video-old', 'other-thing'], parseSlots(undefined))).toEqual(['video-old'])
  })
})

describe('keys and times (Karachi)', () => {
  const [morning] = parseSlots(undefined)
  it('uses the Karachi date, not UTC', () => {
    // 20:30 UTC on 16 Oct is already 17 Oct 01:30 in Karachi
    expect(karachiDate(Date.UTC(2026, 9, 16, 20, 30))).toBe('2026-10-17')
    expect(editionKey(morning!, Date.UTC(2026, 9, 17, 2, 40))).toBe('2026-10-17-morning')
  })
  it('slot time is 07:40 PKT = 02:40 UTC', () => {
    expect(slotTimeMs(morning!, Date.UTC(2026, 9, 17, 2, 41))).toBe(Date.UTC(2026, 9, 17, 2, 40))
  })
  it('post time is render time plus the veto', () => {
    expect(hhmm(postAtMs(morning!, Date.UTC(2026, 9, 17, 2, 40, 5), 20))).toBe('08:00')
  })
  it('a manual run far from the slot counts the veto from now', () => {
    const now = Date.UTC(2026, 9, 17, 9, 0)
    expect(postAtMs(morning!, now, 20)).toBe(now + 20 * 60_000)
  })
})
