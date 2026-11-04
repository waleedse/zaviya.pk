import { DATA_PAGES, type DataPageKey, type RateSeries } from '@zaviya/shared'
import { archiveDayRange, isArchiveDate } from './archive'

/**
 * Dated rate pages: /<data page slug>/YYYY-MM-DD, one indexable URL per Pakistan day for which the `data-points`
 * collection holds at least one point of the family. LPG is not here: no LPG series is stored, and a page is never
 * created for a day we have no data for.
 */

export interface RateFamilySeries {
  series: RateSeries
  label: string
  /** How to write the figure: 'Rs 369.06 per litre' */
  suffix: string
}

export interface RateFamily {
  key: DataPageKey
  slug: string
  /** "Petrol price", "Gold rate", "Dollar rate" */
  noun: string
  /** Series shown on the page, first = the headline figure */
  series: RateFamilySeries[]
  /** The figure in the title */
  headline: RateSeries
  /** Why this figure is not a government/official one, when it is not */
  basisNote: string
}

export const RATE_FAMILIES: RateFamily[] = [
  {
    key: 'petrol',
    slug: 'petrol-price-today-pakistan',
    noun: 'Petrol price',
    headline: 'petrol_super',
    series: [
      { series: 'petrol_super', label: 'Petrol (Super)', suffix: 'per litre' },
      { series: 'hsd', label: 'High Speed Diesel', suffix: 'per litre' },
      { series: 'kerosene', label: 'Kerosene oil', suffix: 'per litre' },
    ],
    basisNote: 'Government-notified prices, recorded when at least two Pakistani news outlets reported the same figure.',
  },
  {
    key: 'gold',
    slug: 'gold-rate-today-pakistan',
    noun: 'Gold rate',
    headline: 'gold_24k_tola',
    series: [
      { series: 'gold_24k_tola', label: '24K gold', suffix: 'per tola' },
      { series: 'gold_22k_tola', label: '22K gold', suffix: 'per tola' },
    ],
    basisNote: 'Zaviya estimate: international spot gold converted to rupees at the market exchange rate. Local Sarafa (jewellers) rates differ by a premium.',
  },
  {
    key: 'usd-pkr',
    slug: 'dollar-rate-today-pakistan',
    noun: 'Dollar rate',
    headline: 'usd_open_sell',
    series: [
      { series: 'usd_open_sell', label: 'Open market, sell', suffix: 'per US dollar' },
      { series: 'usd_open_buy', label: 'Open market, buy', suffix: 'per US dollar' },
      { series: 'usd_interbank', label: 'Market (mid) rate', suffix: 'per US dollar' },
    ],
    basisNote: 'Open-market buy and sell rates as listed on forex.pk; the market rate is the mid-market rate from exchangerate-api.com. Banks may quote differently.',
  },
]

export const rateFamilyBySlug = (slug: string): RateFamily | undefined => RATE_FAMILIES.find((f) => f.slug === slug)
export const rateFamilyByKey = (key: DataPageKey): RateFamily => RATE_FAMILIES.find((f) => f.key === key)!

// Every data page has a family (guards against a data page being added without one)
export const RATE_FAMILY_KEYS_COVERED = DATA_PAGES.every((d) => RATE_FAMILIES.some((f) => f.key === d.key))

export const rateDayPath = (family: RateFamily, date: string): string => `/${family.slug}/${date}`
export const rateHistoryPath = (family: RateFamily): string => `/${family.slug}/history`

export const isRateDate = isArchiveDate
export const rateDayRange = archiveDayRange

export function rateDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
}

export interface DayPoint {
  series: string
  value: number
  unit: string
  source: string
  observedAt: string
}

export interface SeriesDay {
  series: RateSeries
  label: string
  suffix: string
  unit: string
  source: string
  /** Last figure recorded that day */
  close: number
  /** First figure recorded that day */
  open: number
  low: number
  high: number
  readings: number
  lastObservedAt: string
}

/** One row per family series that has points on the day (points of any order). */
export function summariseDay(family: RateFamily, points: DayPoint[]): SeriesDay[] {
  const out: SeriesDay[] = []
  for (const s of family.series) {
    const mine = points.filter((p) => p.series === s.series).sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    if (!mine.length) continue
    const values = mine.map((p) => p.value)
    const last = mine[mine.length - 1]!
    out.push({
      series: s.series,
      label: s.label,
      suffix: s.suffix,
      unit: last.unit,
      source: last.source,
      close: last.value,
      open: mine[0]!.value,
      low: Math.min(...values),
      high: Math.max(...values),
      readings: mine.length,
      lastObservedAt: last.observedAt,
    })
  }
  return out
}

export function formatRs(value: number): string {
  const dp = Number.isInteger(value) ? 0 : 2
  return `Rs ${value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: 2 })}`
}

export function dayTitle(family: RateFamily, date: string, rows: SeriesDay[]): string {
  const head = rows.find((r) => r.series === family.headline)
  const base = `${family.noun} in Pakistan on ${rateDateLabel(date)}`
  if (!head) return base
  const lead = family.key === 'gold' ? '24K ' : ''
  return `${base}: ${lead}${formatRs(head.close)} ${head.suffix}`
}

export function dayDescription(family: RateFamily, date: string, rows: SeriesDay[]): string {
  const parts = rows.map((r) => `${r.label} ${formatRs(r.close)} ${r.suffix}`)
  return `${family.noun} in Pakistan on ${rateDateLabel(date)}: ${parts.join(', ')}. Figures recorded by Zaviya News, with the earlier and later days.`.slice(0, 300)
}

/** The change of a figure against the previous day we hold data for, or null when there is no previous day. */
export function dayChange(close: number, previousClose: number | undefined): { change: number; pct: number } | null {
  if (previousClose === undefined || !previousClose) return null
  const change = Math.round((close - previousClose) * 100) / 100
  return { change, pct: Math.round((change / previousClose) * 10_000) / 100 }
}

/** Previous and next date with data, from a newest-first list of dates. */
export function neighbourDays(days: string[], date: string): { prev?: string; next?: string } {
  const i = days.indexOf(date)
  if (i < 0) return {}
  return { next: i > 0 ? days[i - 1] : undefined, prev: i < days.length - 1 ? days[i + 1] : undefined }
}
