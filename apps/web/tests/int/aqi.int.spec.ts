import { describe, expect, it } from 'vitest'
import { aqiBand, getCityAqi, isAqiStale, isSmogStory, parseAqiResponse } from '../../src/lib/aqi'

describe('aqi', () => {
  it('maps US AQI bands at the edges', () => {
    expect(aqiBand(50).key).toBe('good')
    expect(aqiBand(51).key).toBe('moderate')
    expect(aqiBand(152).key).toBe('unhealthy')
    expect(aqiBand(301).key).toBe('hazardous')
  })
  it('parses a multi-location response and skips bad rows', () => {
    const rows = parseAqiResponse(
      [
        { current: { time: '2026-10-25T21:00', us_aqi: 152.4, pm2_5: 63.84 } },
        { current: { time: '2026-10-25T21:00', us_aqi: null, pm2_5: 10 } },
        { current: { time: '2026-10-25T21:00', us_aqi: 90, pm2_5: 20 } },
      ],
      ['lahore', 'karachi', 'islamabad'],
    )
    expect(rows.map((r) => r.slug)).toEqual(['lahore', 'islamabad'])
    expect(rows[0]).toMatchObject({ aqi: 152, pm25: 63.8 })
  })
  it('returns [] when the API fails', async () => {
    expect(await getCityAqi((async () => new Response('x', { status: 500 })) as typeof fetch)).toEqual([])
    expect(await getCityAqi((async () => { throw new Error('down') }) as typeof fetch)).toEqual([])
  })
  it('treats a reading older than 6 h as stale', () => {
    const now = new Date('2026-10-31T10:00:00Z') // 15:00 PKT
    expect(isAqiStale('2026-10-31T14:00', now)).toBe(false)
    expect(isAqiStale('2026-10-31T09:00', now)).toBe(false)
    expect(isAqiStale('2026-10-31T08:00', now)).toBe(true)
    expect(isAqiStale('garbage', now)).toBe(true)
  })
  it('spots smog stories by title or tag', () => {
    expect(isSmogStory({ title: 'Smog crackdown in Lahore' })).toBe(true)
    expect(isSmogStory({ title: 'x', tags: [{ slug: 'air-quality', name: 'Air quality' }] })).toBe(true)
    expect(isSmogStory({ title: 'Budget talks', tags: [{ slug: 'imf', name: 'IMF' }] })).toBe(false)
  })
})
