import { PK_CITIES } from './prayer-times'

/** Cities shown on the AQI page (ZAV-183): the smog belt first. */
export const AQI_CITY_SLUGS = ['lahore', 'karachi', 'islamabad', 'rawalpindi', 'faisalabad', 'multan', 'peshawar', 'gujranwala', 'sialkot', 'quetta'] as const

export interface AqiBand {
  key: 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous'
  en: string
  ur: string
  /** tailwind classes for the badge */
  tone: string
  adviceEn: string
  adviceUr: string
}

/** US EPA AQI bands. */
export function aqiBand(aqi: number): AqiBand {
  if (aqi <= 50) return { key: 'good', en: 'Good', ur: 'اچھی', tone: 'bg-green-100 text-green-900', adviceEn: 'Air quality is satisfactory.', adviceUr: 'ہوا کا معیار تسلی بخش ہے۔' }
  if (aqi <= 100) return { key: 'moderate', en: 'Moderate', ur: 'درمیانی', tone: 'bg-yellow-100 text-yellow-900', adviceEn: 'Unusually sensitive people should limit long outdoor effort.', adviceUr: 'حساس افراد طویل بیرونی مشقت کم کریں۔' }
  if (aqi <= 150) return { key: 'sensitive', en: 'Unhealthy for sensitive groups', ur: 'حساس گروہوں کے لیے مضر', tone: 'bg-orange-100 text-orange-900', adviceEn: 'Children, older people and people with asthma or heart disease should cut down outdoor time and wear a mask outside.', adviceUr: 'بچے، بزرگ اور دمہ یا دل کے مریض باہر کم وقت گزاریں اور ماسک پہنیں۔' }
  if (aqi <= 200) return { key: 'unhealthy', en: 'Unhealthy', ur: 'مضر', tone: 'bg-red-100 text-red-900', adviceEn: 'Everyone should reduce outdoor exertion; wear an N95 mask outside and keep windows closed.', adviceUr: 'سب باہر کی مشقت کم کریں، باہر N95 ماسک پہنیں اور کھڑکیاں بند رکھیں۔' }
  if (aqi <= 300) return { key: 'very-unhealthy', en: 'Very unhealthy', ur: 'بہت مضر', tone: 'bg-purple-100 text-purple-900', adviceEn: 'Avoid outdoor activity, use an N95 mask if you must go out, and run an air purifier indoors if you have one.', adviceUr: 'باہر کی سرگرمی سے بچیں، ضرورت پر N95 ماسک پہنیں۔' }
  return { key: 'hazardous', en: 'Hazardous', ur: 'خطرناک', tone: 'bg-rose-200 text-rose-950', adviceEn: 'Stay indoors with windows closed.', adviceUr: 'گھر کے اندر رہیں اور کھڑکیاں بند رکھیں۔' }
}

export interface CityAqi {
  slug: string
  en: string
  ur: string
  aqi: number
  pm25: number
  /** local time of the reading, e.g. 2026-10-25T21:00 (Pakistan time) */
  time: string
}

/** Parse an Open-Meteo multi-location air-quality response (an array, or one object for one location). */
export function parseAqiResponse(json: unknown, slugs: readonly string[]): CityAqi[] {
  const arr = Array.isArray(json) ? json : [json]
  const out: CityAqi[] = []
  arr.forEach((loc, i) => {
    const cur = (loc as { current?: { us_aqi?: number | null; pm2_5?: number | null; time?: string } } | null)?.current
    const city = PK_CITIES.find((c) => c.slug === slugs[i])
    if (!cur || !city || typeof cur.us_aqi !== 'number' || typeof cur.pm2_5 !== 'number' || !cur.time) return
    out.push({ slug: city.slug, en: city.en, ur: city.ur, aqi: Math.round(cur.us_aqi), pm25: Math.round(cur.pm2_5 * 10) / 10, time: cur.time })
  })
  return out
}

/** Current modelled air quality (Open-Meteo, CAMS data) for the AQI cities. Empty on any failure. */
export async function getCityAqi(fetchFn: typeof fetch = fetch): Promise<CityAqi[]> {
  const cities = AQI_CITY_SLUGS.map((s) => PK_CITIES.find((c) => c.slug === s)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  const url =
    'https://air-quality-api.open-meteo.com/v1/air-quality?current=us_aqi,pm2_5&timezone=Asia%2FKarachi' +
    `&latitude=${cities.map((c) => c.lat).join(',')}&longitude=${cities.map((c) => c.lng).join(',')}`
  try {
    const res = await fetchFn(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) } as RequestInit)
    if (!res.ok) return []
    return parseAqiResponse(await res.json(), cities.map((c) => c.slug))
  } catch {
    return []
  }
}
