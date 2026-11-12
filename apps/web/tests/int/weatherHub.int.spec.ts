import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { WeatherHubView, weatherHubSeo } from '../../src/components/weather/WeatherViews'
import { addDays, pktToday, type CityWeather } from '../../src/lib/weather'

const now = new Date('2026-11-12T10:00:00Z')
const tomorrow = addDays(pktToday(now), 1)
const city = (slug: string, en: string, ur: string, min: number, max: number): CityWeather => ({
  slug, en, ur, nowTemp: null, nowTime: null,
  days: [{ date: tomorrow, code: 2, min, max, rainChance: 10, rainMm: 0, windKmh: 10, morningVisibilityM: 5000 }],
})

describe('weather hub (ZG-23, option B)', () => {
  it('is titled for the real searches', () => {
    const t = weatherHubSeo('en', now).title
    expect(t).toMatch(/Weather Tomorrow in Pakistan/)
    expect(t).toMatch(/Karachi Weather/)
    expect(t).toMatch(/Lahore Weather Tomorrow/)
  })
  it('has a short tomorrow line per main city, names Open-Meteo as the source and links PMD', () => {
    const html = renderToStaticMarkup(createElement(WeatherHubView, { locale: 'en', weather: [city('karachi', 'Karachi', 'کراچی', 18, 29), city('lahore', 'Lahore', 'لاہور', 9, 22)], now }))
    expect(html).toContain('Karachi weather tomorrow: partly cloudy, 18° to 29°C, 10% chance of rain.')
    expect(html).toContain('Lahore weather tomorrow')
    expect(html).toContain('https://open-meteo.com/')
    expect(html).toContain('https://pmd.gov.pk')
    expect(html).toMatch(/model forecast/i)
  })
})
