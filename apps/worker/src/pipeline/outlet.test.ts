import { describe, expect, it } from 'vitest'
import { cleanTags, pacingWaitMs, stripOutletRefs } from './publish.js'
import { sourceTextChars } from './write.js'
import type { PayloadClient } from '../payload-client.js'

describe('outlet names', () => {
  it('removes outlet prefixes and attributions from headlines', () => {
    expect(stripOutletRefs('Dawn: India beat West Indies in T20 with Abhishek')).toBe('India beat West Indies in T20 with Abhishek')
    expect(stripOutletRefs('Panjgur traders strike observed, Dawn headline says')).toBe('Panjgur traders strike observed')
    expect(stripOutletRefs('Two killed, 12 injured in Attock, Dawn reports today')).toBe('Two killed, 12 injured in Attock')
    expect(stripOutletRefs('SBP keeps policy rate at 11%')).toBe('SBP keeps policy rate at 11%')
  })

  it('drops outlet names from tags', () => {
    expect(cleanTags(['Dawn', 'China', 'Google News', 'ARY News', 'Chinese imports'])).toEqual(['China', 'Chinese imports'])
  })
})

describe('source text gate', () => {
  it('ignores headline-only items', () => {
    expect(sourceTextChars([{ title: 'Reality of Chinese imports - Dawn', summary: 'Reality of Chinese imports  Dawn' }])).toBe(0)
    expect(sourceTextChars([{ title: 'A', contentText: 'x'.repeat(800) }])).toBe(800)
  })
})

describe('publish pacing', () => {
  const settings = (s: object) => ({ getSettings: async () => s }) as unknown as PayloadClient
  const now = Date.parse('2026-10-13T10:00:00Z')
  it('waits for the 10-minute slot (even when Settings says 20) and stops at the daily cap', async () => {
    expect(await pacingWaitMs(settings({ minIntervalMin: 20, lastPublishedAt: '2026-10-13T09:49:00Z', articlesPublishedToday: 5 }), now)).toBe(0)
    const wait = await pacingWaitMs(settings({ minIntervalMin: 20, lastPublishedAt: '2026-10-13T09:55:00Z', articlesPublishedToday: 5 }), now)
    expect(wait).toBeGreaterThanOrEqual(5 * 60_000)
    expect(wait).toBeLessThan(7 * 60_000)
    expect(await pacingWaitMs(settings({ minIntervalMin: 15, articlesPublishedToday: 96, dailyCaps: { articles: 96 } }), now)).toBeGreaterThanOrEqual(60 * 60_000)
    // 5 Nov: no articles cap in Settings means 40 a day
    expect(await pacingWaitMs(settings({ minIntervalMin: 15, articlesPublishedToday: 40, dailyCaps: { facebook: 15 } }), now)).toBeGreaterThanOrEqual(60 * 60_000)
    expect(await pacingWaitMs(settings({ minIntervalMin: 15, articlesPublishedToday: 20, lastPublishedAt: '2026-10-13T09:00:00Z' }), now)).toBe(0)
    // 6 Nov: 15:00 PKT allows 31 of 40, so 35 waits for the next slot even though the cap is not spent
    const slot = await pacingWaitMs(settings({ articlesPublishedToday: 35, lastPublishedAt: '2026-10-13T09:00:00Z' }), now)
    expect(slot).toBeGreaterThanOrEqual(10 * 60_000)
    expect(slot).toBeLessThanOrEqual(62 * 60_000)
    // the overdue desk skips the schedule but still stops at cap + 6
    expect(await pacingWaitMs(settings({ articlesPublishedToday: 35, lastPublishedAt: '2026-10-13T09:00:00Z' }), now, true)).toBe(0)
    expect(await pacingWaitMs(settings({ articlesPublishedToday: 46, lastPublishedAt: '2026-10-13T09:00:00Z' }), now, true)).toBe(60 * 60_000)
  })
})
