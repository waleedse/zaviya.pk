/**
 * Namaz timings calculated on the server, so the page never depends on a third-party API.
 * Method: University of Islamic Sciences, Karachi (Fajr and Isha at 18°), the standard
 * used across Pakistan. Asr uses the Hanafi shadow factor (2) by default, Shafi (1) on request.
 * Results match published Karachi timetables to within a minute or two.
 */

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
export type AsrMethod = 'hanafi' | 'shafi'

export const PRAYER_KEYS: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']

export const PRAYER_NAMES: Record<PrayerKey, { en: string; ur: string }> = {
  fajr: { en: 'Fajr', ur: 'فجر' },
  sunrise: { en: 'Sunrise', ur: 'طلوع آفتاب' },
  dhuhr: { en: 'Dhuhr', ur: 'ظہر' },
  asr: { en: 'Asr', ur: 'عصر' },
  maghrib: { en: 'Maghrib', ur: 'مغرب' },
  isha: { en: 'Isha', ur: 'عشاء' },
}

export interface PkCity {
  slug: string
  en: string
  ur: string
  lat: number
  lng: number
}

/** Ordered roughly by population; the first one is the default. */
export const PK_CITIES: PkCity[] = [
  { slug: 'karachi', en: 'Karachi', ur: 'کراچی', lat: 24.8607, lng: 67.0011 },
  { slug: 'lahore', en: 'Lahore', ur: 'لاہور', lat: 31.5497, lng: 74.3436 },
  { slug: 'islamabad', en: 'Islamabad', ur: 'اسلام آباد', lat: 33.6844, lng: 73.0479 },
  { slug: 'rawalpindi', en: 'Rawalpindi', ur: 'راولپنڈی', lat: 33.5973, lng: 73.0479 },
  { slug: 'faisalabad', en: 'Faisalabad', ur: 'فیصل آباد', lat: 31.4187, lng: 73.0791 },
  { slug: 'multan', en: 'Multan', ur: 'ملتان', lat: 30.1575, lng: 71.5249 },
  { slug: 'peshawar', en: 'Peshawar', ur: 'پشاور', lat: 34.0151, lng: 71.5249 },
  { slug: 'quetta', en: 'Quetta', ur: 'کوئٹہ', lat: 30.1798, lng: 66.975 },
  { slug: 'hyderabad', en: 'Hyderabad', ur: 'حیدرآباد', lat: 25.396, lng: 68.3578 },
  { slug: 'gujranwala', en: 'Gujranwala', ur: 'گوجرانوالہ', lat: 32.1877, lng: 74.1945 },
  { slug: 'sialkot', en: 'Sialkot', ur: 'سیالکوٹ', lat: 32.4945, lng: 74.5229 },
  { slug: 'sargodha', en: 'Sargodha', ur: 'سرگودھا', lat: 32.0836, lng: 72.6711 },
  { slug: 'bahawalpur', en: 'Bahawalpur', ur: 'بہاولپور', lat: 29.3956, lng: 71.6836 },
  { slug: 'sukkur', en: 'Sukkur', ur: 'سکھر', lat: 27.7052, lng: 68.8574 },
  { slug: 'abbottabad', en: 'Abbottabad', ur: 'ایبٹ آباد', lat: 34.1688, lng: 73.2215 },
  { slug: 'mardan', en: 'Mardan', ur: 'مردان', lat: 34.1986, lng: 72.0404 },
  { slug: 'muzaffarabad', en: 'Muzaffarabad', ur: 'مظفرآباد', lat: 34.37, lng: 73.4711 },
  { slug: 'gilgit', en: 'Gilgit', ur: 'گلگت', lat: 35.9208, lng: 74.3089 },
  { slug: 'gwadar', en: 'Gwadar', ur: 'گوادر', lat: 25.1216, lng: 62.3254 },
]

export function findCity(slug?: string | null): PkCity {
  return PK_CITIES.find((c) => c.slug === slug) ?? PK_CITIES[0]!
}

const PKT_OFFSET_HOURS = 5
const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

function julianDay(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045 - 0.5
}

function sunPosition(jd: number) {
  const D = jd - 2451545.0
  const g = (357.529 + 0.98560028 * D) % 360
  const q = (280.459 + 0.98564736 * D) % 360
  const L = (q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g))) % 360
  const e = 23.439 - 0.00000036 * D
  const ra = deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15
  const decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L))))
  let eqt = q / 15 - ((ra + 24) % 24)
  eqt = ((eqt + 12) % 24 + 24) % 24 - 12
  return { decl, eqt }
}

/** Minutes after local (PKT) midnight for each prayer. */
export function prayerTimes(city: Pick<PkCity, 'lat' | 'lng'>, date: { y: number; m: number; d: number }, asr: AsrMethod = 'hanafi'): Record<PrayerKey, number> {
  const { lat, lng } = city
  const { decl, eqt } = sunPosition(julianDay(date.y, date.m, date.d))
  const noon = 12 + PKT_OFFSET_HOURS - lng / 15 - eqt
  const hourAngle = (angle: number) =>
    deg(Math.acos((-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat))))) / 15
  const factor = asr === 'shafi' ? 1 : 2
  const asrAlt = -deg(Math.atan(1 / (factor + Math.tan(rad(Math.abs(lat - decl))))))
  const toMin = (h: number) => Math.round(h * 60)
  return {
    fajr: toMin(noon - hourAngle(18)),
    sunrise: toMin(noon - hourAngle(0.833)),
    dhuhr: toMin(noon) + 1,
    asr: toMin(noon + hourAngle(asrAlt)),
    maghrib: toMin(noon + hourAngle(0.833)),
    isha: toMin(noon + hourAngle(18)),
  }
}

/** Qibla bearing in degrees from true north. */
export function qiblaBearing(city: Pick<PkCity, 'lat' | 'lng'>): number {
  const kaaba = { lat: 21.4225, lng: 39.8262 }
  const y = Math.sin(rad(kaaba.lng - city.lng))
  const x = Math.cos(rad(city.lat)) * Math.tan(rad(kaaba.lat)) - Math.sin(rad(city.lat)) * Math.cos(rad(kaaba.lng - city.lng))
  return Math.round(((deg(Math.atan2(y, x)) + 360) % 360) * 10) / 10
}

/** Today's date and the current minute in Pakistan time. */
export function pktNow(now = new Date()): { y: number; m: number; d: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), minutes: get('hour') * 60 + get('minute') }
}

export function addDays(date: { y: number; m: number; d: number }, n: number) {
  const dt = new Date(Date.UTC(date.y, date.m - 1, date.d + n))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

export function formatClock(minutes: number, locale: 'en' | 'ur' = 'en'): string {
  const m = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const h12 = ((h + 11) % 12) + 1
  const suffix = locale === 'ur' ? (h < 12 ? 'صبح' : 'شام') : h < 12 ? 'AM' : 'PM'
  return `${h12}:${mm} ${suffix}`
}

export function formatDuration(minutes: number, locale: 'en' | 'ur' = 'en'): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (locale === 'ur') return h ? `${h} گھنٹے ${m} منٹ` : `${m} منٹ`
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/** The next prayer (Sunrise is shown but never counted as a prayer). */
export function nextPrayer(times: Record<PrayerKey, number>, nowMinutes: number): { key: PrayerKey; prev: PrayerKey; minutesLeft: number; progress: number } {
  const order: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
  let idx = order.findIndex((k) => times[k] > nowMinutes)
  let target = idx === -1 ? times.fajr + 1440 : times[order[idx]!]
  if (idx === -1) idx = 0
  const key = order[idx]!
  const prev = order[(idx + order.length - 1) % order.length]!
  let prevTime = times[prev]
  if (prevTime > nowMinutes) prevTime -= 1440
  const minutesLeft = Math.max(0, target - nowMinutes)
  const span = Math.max(1, target - prevTime)
  return { key, prev, minutesLeft, progress: Math.min(100, Math.max(0, Math.round(((span - minutesLeft) / span) * 100))) }
}

export interface CityDay {
  city: PkCity
  times: Record<PrayerKey, number>
}

/** Today's timings for every city, ready to pass to a client widget. */
export function todayForAllCities(asr: AsrMethod = 'hanafi'): { date: { y: number; m: number; d: number }; minutes: number; cities: CityDay[] } {
  const now = pktNow()
  return { date: now, minutes: now.minutes, cities: PK_CITIES.map((city) => ({ city, times: prayerTimes(city, now, asr) })) }
}
