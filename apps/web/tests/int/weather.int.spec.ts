import { describe, expect, it } from 'vitest'
import { addDays, conditionFor, fogLevel, getCityWeather, parseWeatherResponse, pktToday, shortDate } from '../../src/lib/weather'

const lahore = { slug: 'lahore', en: 'Lahore', ur: 'لاہور' }
const sample = {
  current: { time: '2026-11-11T20:30', temperature_2m: 22.3 },
  daily: {
    time: ['2026-11-11', '2026-11-12'],
    weather_code: [0, 45],
    temperature_2m_max: [27.4, 25.6],
    temperature_2m_min: [14.2, 12.5],
    precipitation_probability_max: [0, 30],
    precipitation_sum: [0, 1.25],
    wind_speed_10m_max: [10.4, 8],
  },
  hourly: {
    time: ['2026-11-12T00:00', '2026-11-12T05:00', '2026-11-12T12:00'],
    visibility: [4000, 300, 24000],
  },
}

describe('weather parsing', () => {
  it('reads days, rounds, and takes the lowest morning visibility', () => {
    const w = parseWeatherResponse(sample, lahore)!
    expect(w.nowTemp).toBe(22)
    expect(w.days).toHaveLength(2)
    expect(w.days[1]).toMatchObject({ date: '2026-11-12', min: 13, max: 26, rainChance: 30, rainMm: 1.3, windKmh: 8, morningVisibilityM: 300 })
    expect(w.days[0]!.morningVisibilityM).toBeNull()
  })
  it('returns null for garbage rather than inventing numbers', () => {
    expect(parseWeatherResponse(null, lahore)).toBeNull()
    expect(parseWeatherResponse({ daily: { time: [] } }, lahore)).toBeNull()
    expect(parseWeatherResponse({ daily: { time: ['2026-11-12'], temperature_2m_max: [null], temperature_2m_min: [1], weather_code: [0] } }, lahore)).toBeNull()
  })
  it('getCityWeather is null on a failed fetch or unknown city', async () => {
    expect(await getCityWeather('lahore', (async () => ({ ok: false })) as unknown as typeof fetch)).toBeNull()
    expect(await getCityWeather('lahore', (async () => { throw new Error('x') }) as unknown as typeof fetch)).toBeNull()
    expect(await getCityWeather('nowhere')).toBeNull()
  })
})

describe('weather helpers', () => {
  it('uses the Pakistan date', () => {
    expect(pktToday(new Date('2026-11-11T20:00:00Z'))).toBe('2026-11-12')
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(shortDate('2026-11-12')).toBe('12 Nov')
  })
  it('maps fog and conditions', () => {
    expect(fogLevel(150)).toBe('dense')
    expect(fogLevel(800)).toBe('fog')
    expect(fogLevel(3000)).toBe('mist')
    expect(fogLevel(20000)).toBe('clear')
    expect(fogLevel(null)).toBe('unknown')
    expect(conditionFor(63).rainy).toBe(true)
    expect(conditionFor(0).rainy).toBe(false)
  })
})
