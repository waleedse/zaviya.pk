import { describe, expect, it } from 'vitest'
import { aqiBand, getCityAqi, parseAqiResponse } from '../../src/lib/aqi'

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
})
