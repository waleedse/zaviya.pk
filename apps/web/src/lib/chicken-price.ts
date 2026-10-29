/**
 * Live broiler chicken price from the weekly PBS Sensitive Price Indicator (SPI) (ZAV-249).
 * Edit this file once a week (PBS releases the SPI on Thursday/Friday); the page and the sitemap read it.
 * National figures: PBS SPI executive summary, week ended 22 Oct 2026. City table and the earlier weeks: as read from the
 * PBS city table by Pakistan Era (pakera.pk), 24 Oct 2026; we could not open the PBS annex ourselves. PBS records the price
 * of a LIVE bird by weight, not cleaned meat. Never add a mid-week "today" figure.
 */
export interface CityPrice {
  city: string
  now: number
  prev: number
}

export const CHICKEN = {
  weekEnded: '2026-10-22',
  nationalAvg: 444.27,
  previousWeek: 395.98,
  yearAgo: 319.64,
  wowPct: 12.2,
  yoyPct: 38.99,
}

export const CITIES: CityPrice[] = [
  { city: 'Khuzdar', now: 550, prev: 500 },
  { city: 'Karachi', now: 510.23, prev: 436.42 },
  { city: 'Hyderabad', now: 486.23, prev: 419.58 },
  { city: 'Sukkur', now: 460, prev: 410 },
  { city: 'Larkana', now: 460, prev: 406.64 },
  { city: 'Bannu', now: 455, prev: 415 },
  { city: 'Faisalabad', now: 440, prev: 375 },
  { city: 'Multan', now: 440, prev: 380 },
  { city: 'Peshawar', now: 440, prev: 395 },
  { city: 'Quetta', now: 439.96, prev: 451.61 },
  { city: 'Islamabad', now: 437.94, prev: 393.02 },
  { city: 'Rawalpindi', now: 435.24, prev: 388.94 },
  { city: 'Sargodha', now: 416.66, prev: 378.33 },
  { city: 'Bahawalpur', now: 410, prev: 353.33 },
  { city: 'Gujranwala', now: 405, prev: 353 },
  { city: 'Lahore', now: 398, prev: 348 },
  { city: 'Sialkot', now: 396, prev: 358 },
]

export const TREND = [
  { week: '2026-09-24', value: 340.63 },
  { week: '2026-10-01', value: 365.31 },
  { week: '2026-10-08', value: 383.31 },
  { week: '2026-10-15', value: 395.98 },
  { week: '2026-10-22', value: 444.27 },
]

export const SOURCES = [
  { label: 'PBS: SPI executive summary, week ended 22 Oct 2026 (PDF)', url: 'https://www.pbs.gov.pk/wp-content/uploads/2020/07/Executive-Summary-SPI-Report_22.10.2026.pdf' },
  { label: 'Pakistan Era: chicken price in 17 cities, 22 Oct 2026 (city table and earlier weeks)', url: 'https://pakera.pk/chicken-price-pakistan-22-october-2026/' },
]

export const rsKg = (n: number) => `Rs${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const change = (now: number, prev: number) => Math.round((now - prev) * 100) / 100
