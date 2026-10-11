import Parser from 'rss-parser'
import type { Redis } from 'ioredis'
import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { ZAVIYA_USER_AGENT } from '../ingest/extract.js'
import { logger } from '../logger.js'

/**
 * Real rates only. Every value comes from a public source and is labelled with it;
 * when a source fails we publish nothing rather than a guess.
 */

export interface RatePoint {
  series: 'gold_24k_tola' | 'gold_22k_tola' | 'usd_interbank' | 'usd_open_buy' | 'usd_open_sell' | 'petrol_super' | 'hsd' | 'kerosene'
  value: number
  unit: string
  source: string
  observedAt: string
  city?: string
}

export interface RateSnapshot {
  key: 'gold' | 'usd-pkr' | 'petrol'
  table: { label: string; values: Record<string, number | string> }[]
}

const GRAMS_PER_TOLA = 11.6638
const GRAMS_PER_OZ = 31.1034768
const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Mid-market rates (USD base) from exchangerate-api's free endpoint. */
export async function fetchMarketFx(): Promise<{ usdPkr: number; perUnit: Record<string, number> } | null> {
  const data = await getJson<{ rates?: Record<string, number> }>('https://open.er-api.com/v6/latest/USD')
  const pkr = data?.rates?.PKR
  if (!pkr) return null
  const perUnit: Record<string, number> = {}
  for (const c of ['USD', 'SAR', 'AED', 'GBP', 'EUR', 'CAD', 'AUD']) {
    const r = data!.rates![c]
    if (r) perUnit[c] = round(pkr / r, 2)
  }
  return { usdPkr: round(pkr, 2), perUnit }
}

/** Open-market buy/sell from forex.pk's public table. */
export function parseForexPk(html: string): Record<string, { buy: number; sell: number }> {
  const out: Record<string, { buy: number; sell: number }> = {}
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  for (const row of clean.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [])
      .map((c) => c.replace(/<[^>]+>|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (cells.length < 4) continue
    const code = cells[1]!
    if (!/^[A-Z]{3}$/.test(code) || out[code]) continue
    const buy = Number(cells[2])
    const sell = Number(cells[3])
    if (buy > 0 && sell > 0) out[code] = { buy, sell }
  }
  return out
}

export async function fetchOpenMarket(): Promise<Record<string, { buy: number; sell: number }> | null> {
  try {
    const res = await fetch('https://www.forex.pk/open_market_rates.asp', {
      headers: { 'User-Agent': ZAVIYA_USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const rows = parseForexPk(await res.text())
    return rows.USD ? rows : null
  } catch {
    return null
  }
}

/** International spot gold (USD/oz). */
export async function fetchGoldSpot(): Promise<number | null> {
  const data = await getJson<{ price?: number }>('https://api.gold-api.com/price/XAU')
  return data?.price && Number.isFinite(data.price) ? data.price : null
}

export function goldTable(usdPerOz: number, usdPkr: number) {
  const perGram24 = (usdPerOz / GRAMS_PER_OZ) * usdPkr
  const karats = [24, 22, 21, 18]
  return karats.map((k) => {
    const g = (perGram24 * k) / 24
    return { label: `${k}K`, values: { tola: round(g * GRAMS_PER_TOLA), '10g': round(g * 10), gram: round(g) } }
  })
}

const PRICE_RE = /(?:Rs\.?|PKR|روپے)\s?(\d{3}(?:\.\d{1,2})?)|(\d{3}(?:\.\d{1,2})?)\s?(?:روپے|rupees)/gi

/** Prices mentioned near a fuel name in a headline/summary. */
export function extractFuelPrices(text: string): { petrol?: number; hsd?: number } {
  const out: { petrol?: number; hsd?: number } = {}
  const t = text.replace(/,/g, '')
  for (const m of t.matchAll(PRICE_RE)) {
    const value = Number(m[1] ?? m[2])
    if (!(value > 150 && value < 500)) continue
    // The fuel named closest before the number is the one it belongs to.
    const before = t.slice(Math.max(0, (m.index ?? 0) - 80), m.index ?? 0).toLowerCase()
    const lastIdx = (re: RegExp) => Math.max(-1, ...[...before.matchAll(re)].map((x) => x.index ?? -1))
    const d = lastIdx(/diesel|hsd|ڈیزل/g)
    const p = lastIdx(/petrol|پیٹرول|motor spirit/g)
    if (d > p && !out.hsd) out.hsd = value
    else if (p > d && !out.petrol) out.petrol = value
  }
  return out
}

/** A price only counts when two different outlets report the same number. */
export function agreedValue(values: { value: number; outlet: string }[]): number | null {
  const byValue = new Map<number, Set<string>>()
  for (const v of values) {
    const set = byValue.get(v.value) ?? new Set()
    set.add(v.outlet)
    byValue.set(v.value, set)
  }
  let best: number | null = null
  let bestCount = 1
  for (const [value, outlets] of byValue) {
    if (outlets.size > bestCount) {
      best = value
      bestCount = outlets.size
    }
  }
  return best
}

const rss = new Parser()

export async function fetchFuelFromNews(): Promise<{ petrol?: number; hsd?: number } | null> {
  try {
    const url = 'https://news.google.com/rss/search?q=%22petrol+price%22+%22per+litre%22+Pakistan+when:10d&hl=en-PK&gl=PK&ceid=PK:en'
    const res = await fetch(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const feed = await rss.parseString(await res.text())
    const items = (feed.items ?? [])
      .filter((i) => i.isoDate && Date.now() - new Date(i.isoDate).getTime() < 10 * 86_400_000)
      .sort((a, b) => new Date(b.isoDate!).getTime() - new Date(a.isoDate!).getTime())
      .slice(0, 25)
    const petrol: { value: number; outlet: string }[] = []
    const hsd: { value: number; outlet: string }[] = []
    for (const i of items) {
      const outlet = (i.title ?? '').split(' - ').pop() ?? 'unknown'
      const found = extractFuelPrices(`${i.title ?? ''} ${i.contentSnippet ?? ''}`)
      if (found.petrol) petrol.push({ value: found.petrol, outlet })
      if (found.hsd) hsd.push({ value: found.hsd, outlet })
    }
    return { petrol: agreedValue(petrol) ?? undefined, hsd: agreedValue(hsd) ?? undefined }
  } catch (e) {
    logger.debug({ err: e }, 'fuel-from-news failed')
    return null
  }
}

export async function collectRates(): Promise<{ points: RatePoint[]; snapshots: RateSnapshot[] }> {
  const now = new Date().toISOString()
  const points: RatePoint[] = []
  const snapshots: RateSnapshot[] = []

  const [fx, open, spot, fuel] = await Promise.all([fetchMarketFx(), fetchOpenMarket(), fetchGoldSpot(), fetchFuelFromNews()])

  if (fx) {
    points.push({ series: 'usd_interbank', value: fx.usdPkr, unit: 'PKR', source: 'exchangerate-api.com (mid-market)', observedAt: now })
  }
  if (open?.USD) {
    points.push({ series: 'usd_open_buy', value: open.USD.buy, unit: 'PKR', source: 'forex.pk open market', observedAt: now })
    points.push({ series: 'usd_open_sell', value: open.USD.sell, unit: 'PKR', source: 'forex.pk open market', observedAt: now })
  }
  if (fx || open) {
    const names: Record<string, string> = { USD: 'US Dollar', SAR: 'Saudi Riyal', AED: 'UAE Dirham', GBP: 'British Pound', EUR: 'Euro', CAD: 'Canadian Dollar', AUD: 'Australian Dollar' }
    snapshots.push({
      key: 'usd-pkr',
      table: Object.keys(names)
        .filter((c) => fx?.perUnit[c] || open?.[c])
        .map((c) => ({
          label: `${names[c]} (${c})`,
          values: {
            ...(fx?.perUnit[c] ? { market: fx.perUnit[c]! } : {}),
            ...(open?.[c] ? { buy: open[c]!.buy, sell: open[c]!.sell } : {}),
          },
        })),
    })
  }
  if (spot && fx) {
    const table = goldTable(spot, fx.usdPkr)
    points.push({ series: 'gold_24k_tola', value: table[0]!.values.tola, unit: 'PKR/tola', source: 'International spot × PKR (estimate)', observedAt: now })
    points.push({ series: 'gold_22k_tola', value: table[1]!.values.tola, unit: 'PKR/tola', source: 'International spot × PKR (estimate)', observedAt: now })
    snapshots.push({ key: 'gold', table })
  }
  if (fuel?.petrol) {
    points.push({ series: 'petrol_super', value: fuel.petrol, unit: 'PKR/litre', source: 'Govt notification as reported by 2+ outlets', observedAt: now })
  }
  if (fuel?.hsd) {
    points.push({ series: 'hsd', value: fuel.hsd, unit: 'PKR/litre', source: 'Govt notification as reported by 2+ outlets', observedAt: now })
  }
  if (fuel?.petrol || fuel?.hsd) {
    snapshots.push({
      key: 'petrol',
      table: [
        ...(fuel.petrol ? [{ label: 'Petrol (Super)', values: { price: fuel.petrol } }] : []),
        ...(fuel.hsd ? [{ label: 'High Speed Diesel', values: { price: fuel.hsd } }] : []),
      ],
    })
  }
  return { points, snapshots }
}

const LAST_KEY = (s: string) => `zaviya:rates:last:${s}`
const KEEP_MS = 6 * 3_600_000

/** Store a point only when the value moved or the last stored one is stale, so charts stay meaningful. */
export async function dedupePoints(points: RatePoint[], redis?: Redis): Promise<RatePoint[]> {
  if (!redis) return points
  const out: RatePoint[] = []
  for (const p of points) {
    const raw = await redis.get(LAST_KEY(p.series)).catch(() => null)
    const last = raw ? (JSON.parse(raw) as { value: number; at: number }) : null
    if (last && last.value === p.value && Date.now() - last.at < KEEP_MS) continue
    out.push(p)
    await redis.set(LAST_KEY(p.series), JSON.stringify({ value: p.value, at: Date.now() })).catch(() => undefined)
  }
  return out
}

export async function fetchRatePoints(_env: WorkerEnv, redis?: Redis): Promise<{ points: RatePoint[]; snapshots: RateSnapshot[] }> {
  const { points, snapshots } = await collectRates()
  return { points: await dedupePoints(points, redis), snapshots }
}

export async function postRatePoints(payload: PayloadClient, data: { points: RatePoint[]; snapshots: RateSnapshot[] }): Promise<void> {
  if (!data.points.length && !data.snapshots.length) return
  try {
    await payload.postDataPoints(data.points, data.snapshots)
  } catch (e) {
    logger.warn({ count: data.points.length, err: e instanceof Error ? e.message : e }, 'data-point post failed')
  }
}
