/**
 * Price history as a step series (12 Nov 2026). Only real data: every point is a price an official source showed.
 * The stored history has one row per price change (and, for PBS groceries, one per published weekly release).
 * Between rows the price carried forward (the daily refresh found it unchanged), and the last point is the most recent
 * check (`priceUpdatedAt`), so the line grows to today without a row per day per item.
 */

const DAY = 86_400_000

export interface SeriesPoint {
  /** ms since epoch */
  t: number
  price: number
  /** A recorded price (change or official release); false for the "still this price at the last check" end point */
  real: boolean
  sourceUrl?: string
}

export interface HistoryRow {
  date: string
  pricePkr: number
  sourceUrl?: string
}

/** Calendar day in Pakistan, "2026-11-12" */
export const dayKey = (t: number | string | Date): string => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })

/** Oldest first, one point per Pakistan calendar day (the later row wins), then the latest check carried forward */
export function buildSeries(history: HistoryRow[], current: number | null, checkedAt?: string | null): SeriesPoint[] {
  const byDay = new Map<string, SeriesPoint>()
  for (const r of [...history].sort((a, b) => a.date.localeCompare(b.date))) {
    const t = Date.parse(r.date)
    if (!Number.isFinite(t) || !(r.pricePkr > 0)) continue
    byDay.set(dayKey(t), { t, price: r.pricePkr, real: true, sourceUrl: r.sourceUrl })
  }
  const out = [...byDay.values()].sort((a, b) => a.t - b.t)
  const checked = checkedAt ? Date.parse(checkedAt) : NaN
  if (current && current > 0 && Number.isFinite(checked)) {
    const last = out.at(-1)
    if (!last) out.push({ t: checked, price: current, real: true })
    else if (dayKey(checked) > dayKey(last.t)) out.push({ t: checked, price: current, real: false })
  }
  return out
}

/** Price on a given moment, carried forward from the latest point at or before it; null before the first point */
export function priceAt(series: SeriesPoint[], t: number): number | null {
  let found: number | null = null
  for (const p of series) {
    if (p.t <= t) found = p.price
    else break
  }
  return found
}

export interface Change {
  from: number
  to: number
  abs: number
  pct: number
}

/** Change over the last `days` days; null when the record does not reach back that far (never guessed) */
export function changeOver(series: SeriesPoint[], days: number, now = Date.now()): Change | null {
  const last = series.at(-1)
  if (!last || series.length < 2) return null
  const from = priceAt(series, now - days * DAY)
  if (from == null) return null
  const abs = last.price - from
  return { from, to: last.price, abs, pct: from ? Math.round((abs / from) * 1000) / 10 : 0 }
}

export interface SeriesStats {
  min: { price: number; t: number }
  max: { price: number; t: number }
  first: SeriesPoint
  last: SeriesPoint
  /** whole days from the first point to the last */
  spanDays: number
  /** number of price changes recorded after the first point */
  changes: number
  /** whole days the current price has held, from the last change */
  unchangedDays: number
}

export function seriesStats(series: SeriesPoint[]): SeriesStats | null {
  if (!series.length) return null
  const real = series.filter((p) => p.real)
  let min = series[0]!
  let max = series[0]!
  for (const p of series) {
    if (p.price < min.price) min = p
    if (p.price > max.price) max = p
  }
  const first = series[0]!
  const last = series.at(-1)!
  let lastChange = first
  real.forEach((p, i) => {
    if (i > 0 && p.price !== real[i - 1]!.price) lastChange = p
  })
  return {
    min: { price: min.price, t: min.t },
    max: { price: max.price, t: max.t },
    first,
    last,
    spanDays: Math.max(0, Math.round((last.t - first.t) / DAY)),
    changes: real.filter((p, i) => i > 0 && p.price !== real[i - 1]!.price).length,
    unchangedDays: Math.max(0, Math.round((last.t - lastChange.t) / DAY)),
  }
}

/** A line is worth drawing once the record covers a week; before that, "Tracking since" */
export const MIN_CHART_SPAN_DAYS = 6

export function chartState(series: SeriesPoint[]): 'chart' | 'tracking' | 'none' {
  if (!series.length) return 'none'
  const s = seriesStats(series)!
  return s.spanDays >= MIN_CHART_SPAN_DAYS || s.changes > 0 ? 'chart' : 'tracking'
}

export interface Move {
  from: number
  to: number
  pct: number
  /** when the price changed */
  t: number
}

/** The latest price change (the last real point that differs from the one before it), when it is within `withinDays` */
export function latestMove(series: SeriesPoint[], withinDays: number, now = Date.now()): Move | null {
  const real = series.filter((p) => p.real)
  for (let i = real.length - 1; i > 0; i--) {
    const p = real[i]!
    const prev = real[i - 1]!
    if (p.price === prev.price) continue
    if (now - p.t > withinDays * DAY) return null
    return { from: prev.price, to: p.price, pct: Math.round(((p.price - prev.price) / prev.price) * 1000) / 10, t: p.t }
  }
  return null
}
