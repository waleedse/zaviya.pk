import { PK_CITIES, type PkCity } from './prayer-times'

/** Cities with a weather page: every city we have coordinates for. */
export const WEATHER_CITIES: PkCity[] = PK_CITIES

/** Cities shown on the /weather hub overview table (the biggest first). */
export const WEATHER_HUB_SLUGS = ['lahore', 'karachi', 'islamabad', 'rawalpindi', 'faisalabad', 'multan', 'peshawar', 'quetta', 'gujranwala', 'sialkot'] as const

export interface WeatherDay {
  /** YYYY-MM-DD, Pakistan date */
  date: string
  code: number
  min: number
  max: number
  /** chance of rain 0-100, null when the model gives none */
  rainChance: number | null
  /** expected rain in mm */
  rainMm: number | null
  /** top wind, km/h */
  windKmh: number | null
  /** lowest visibility between midnight and 9 am, metres; null if unknown */
  morningVisibilityM: number | null
}

export interface CityWeather {
  slug: string
  en: string
  ur: string
  /** Current temperature and time (Pakistan time), when the API gives them */
  nowTemp: number | null
  nowTime: string | null
  days: WeatherDay[]
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round1 = (n: number) => Math.round(n * 10) / 10

/** Parse an Open-Meteo forecast response for one location. Returns null if the daily block is unusable. */
export function parseWeatherResponse(json: unknown, city: Pick<PkCity, 'slug' | 'en' | 'ur'>): CityWeather | null {
  const j = json as {
    current?: { temperature_2m?: unknown; time?: unknown }
    daily?: Record<string, unknown[] | undefined>
    hourly?: { time?: string[]; visibility?: unknown[] }
  } | null
  const d = j?.daily
  const times = d?.time
  if (!d || !Array.isArray(times) || times.length === 0) return null

  // lowest visibility per day over 00:00-09:00 local
  const vis = new Map<string, number>()
  const ht = j?.hourly?.time
  const hv = j?.hourly?.visibility
  if (Array.isArray(ht) && Array.isArray(hv)) {
    ht.forEach((t, i) => {
      const v = num(hv[i])
      if (v === null || typeof t !== 'string') return
      if (Number(t.slice(11, 13)) > 9) return
      const day = t.slice(0, 10)
      const prev = vis.get(day)
      if (prev === undefined || v < prev) vis.set(day, v)
    })
  }

  const days: WeatherDay[] = []
  times.forEach((t, i) => {
    const min = num(d.temperature_2m_min?.[i])
    const max = num(d.temperature_2m_max?.[i])
    const code = num(d.weather_code?.[i])
    if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t) || min === null || max === null || code === null) return
    const rain = num(d.precipitation_probability_max?.[i])
    const mm = num(d.precipitation_sum?.[i])
    const wind = num(d.wind_speed_10m_max?.[i])
    days.push({
      date: t,
      code,
      min: Math.round(min),
      max: Math.round(max),
      rainChance: rain === null ? null : Math.round(rain),
      rainMm: mm === null ? null : round1(mm),
      windKmh: wind === null ? null : Math.round(wind),
      morningVisibilityM: vis.has(t) ? Math.round(vis.get(t)!) : null,
    })
  })
  if (days.length === 0) return null

  const nowTemp = num(j?.current?.temperature_2m)
  const nowTime = typeof j?.current?.time === 'string' ? j.current.time : null
  return { slug: city.slug, en: city.en, ur: city.ur, nowTemp: nowTemp === null ? null : Math.round(nowTemp), nowTime, days }
}

/** 10-day forecast for one city from Open-Meteo (no key). Null on any failure. */
export async function getCityWeather(slug: string, fetchFn: typeof fetch = fetch): Promise<CityWeather | null> {
  const city = PK_CITIES.find((c) => c.slug === slug)
  if (!city) return null
  const url =
    'https://api.open-meteo.com/v1/forecast?timezone=Asia%2FKarachi&forecast_days=10' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max' +
    '&hourly=visibility&current=temperature_2m' +
    `&latitude=${city.lat}&longitude=${city.lng}`
  try {
    const res = await fetchFn(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) } as RequestInit)
    if (!res.ok) return null
    return parseWeatherResponse(await res.json(), city)
  } catch {
    return null
  }
}

/** Forecasts for the hub's cities; cities that fail are left out. */
export async function getHubWeather(fetchFn: typeof fetch = fetch): Promise<CityWeather[]> {
  const all = await Promise.all(WEATHER_HUB_SLUGS.map((s) => getCityWeather(s, fetchFn)))
  return all.filter((w): w is CityWeather => w !== null)
}

/** Today's date in Pakistan (YYYY-MM-DD). */
export function pktToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10)
}

/** The forecast day for `date`, or undefined (never a stale or invented day). */
export function dayFor(w: CityWeather, date: string): WeatherDay | undefined {
  return w.days.find((d) => d.date === date)
}

export function addDays(date: string, n: number): string {
  const t = new Date(`${date}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_UR = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ']

/** "12 Nov" / "12 نومبر" */
export function shortDate(date: string, ur = false): string {
  const m = Number(date.slice(5, 7)) - 1
  return `${Number(date.slice(8, 10))} ${(ur ? MONTHS_UR : MONTHS_EN)[m]}`
}

export function weekday(date: string, ur = false): string {
  return (ur ? WEEKDAYS_UR : WEEKDAYS_EN)[new Date(`${date}T12:00:00Z`).getUTCDay()]!
}

export interface Condition {
  en: string
  ur: string
  emoji: string
  rainy: boolean
}

/** WMO weather code to words. */
export function conditionFor(code: number): Condition {
  if (code === 0) return { en: 'Clear', ur: 'صاف', emoji: '☀️', rainy: false }
  if (code <= 2) return { en: 'Partly cloudy', ur: 'جزوی ابر آلود', emoji: '⛅', rainy: false }
  if (code === 3) return { en: 'Cloudy', ur: 'ابر آلود', emoji: '☁️', rainy: false }
  if (code === 45 || code === 48) return { en: 'Fog', ur: 'دھند', emoji: '🌫️', rainy: false }
  if (code >= 51 && code <= 57) return { en: 'Drizzle', ur: 'ہلکی بوندا باندی', emoji: '🌦️', rainy: true }
  if (code >= 61 && code <= 67) return { en: 'Rain', ur: 'بارش', emoji: '🌧️', rainy: true }
  if (code >= 71 && code <= 77) return { en: 'Snow', ur: 'برف باری', emoji: '❄️', rainy: true }
  if (code >= 80 && code <= 82) return { en: 'Rain showers', ur: 'بارش کے چھینٹے', emoji: '🌦️', rainy: true }
  if (code === 85 || code === 86) return { en: 'Snow showers', ur: 'برف کے چھینٹے', emoji: '🌨️', rainy: true }
  if (code >= 95) return { en: 'Thunderstorm', ur: 'آندھی طوفان اور بارش', emoji: '⛈️', rainy: true }
  return { en: 'Mixed', ur: 'ملا جلا', emoji: '🌤️', rainy: false }
}

export type FogLevel = 'dense' | 'fog' | 'mist' | 'clear' | 'unknown'

/** Morning visibility in metres to a fog level (under 1 km is fog by the usual definition). */
export function fogLevel(visibilityM: number | null): FogLevel {
  if (visibilityM === null) return 'unknown'
  if (visibilityM < 200) return 'dense'
  if (visibilityM < 1000) return 'fog'
  if (visibilityM < 5000) return 'mist'
  return 'clear'
}

export function fogLabel(level: FogLevel, ur = false): string {
  const m = {
    dense: ['Dense fog likely', 'گہری دھند کا امکان'],
    fog: ['Fog likely in the morning', 'صبح دھند کا امکان'],
    mist: ['Light mist in the morning', 'صبح ہلکی دھند'],
    clear: ['No fog expected', 'دھند کا امکان نہیں'],
    unknown: ['Visibility not available', 'نظر آنے کی حد دستیاب نہیں'],
  }[level]
  return ur ? m[1] : m[0]
}

export function rainLabel(chance: number | null, ur = false): string {
  if (chance === null) return ur ? 'بارش کا امکان دستیاب نہیں' : 'Rain chance not available'
  return ur ? `بارش کا امکان ${chance}%` : `${chance}% chance of rain`
}
