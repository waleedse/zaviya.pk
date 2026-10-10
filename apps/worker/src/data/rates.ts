import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { logger } from '../logger.js'

export interface RatePoint {
  series: string
  value: number
  unit: string
  source: string
  observedAt: string
  city?: string
}

export interface RateSourceAdapter {
  id: string
  fetch: () => Promise<RatePoint[]>
}

async function fetchUsdPkr(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { rates?: { PKR?: number } }
    return typeof data.rates?.PKR === 'number' ? data.rates.PKR : null
  } catch {
    return null
  }
}

/** Interbank-style USD/PKR from a public FX feed (stand-in until official SBP JSON). */
export const sbpAdapter: RateSourceAdapter = {
  id: 'sbp',
  fetch: async () => {
    const pkr = await fetchUsdPkr()
    if (!pkr) return []
    return [
      {
        series: 'usd_interbank',
        value: Math.round(pkr * 100) / 100,
        unit: 'PKR',
        source: 'open.er-api.com',
        observedAt: new Date().toISOString(),
      },
    ]
  },
}

/**
 * OGRA retail petrol/diesel — scrapes the public notification index when available.
 * Falls back to empty (seeded data remains) rather than inventing prices.
 */
export const ograAdapter: RateSourceAdapter = {
  id: 'ogra',
  fetch: async () => {
    try {
      const res = await fetch('https://www.ogra.org.pk/petroleum-prices', {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'ZaviyaBot/0.1 (+https://zaviya.pk)' },
      })
      if (!res.ok) return []
      const html = await res.text()
      // Match patterns like "Petrol  264.61" / "High Speed Diesel  267.xx"
      const petrol = html.match(/Petrol[^0-9]{0,40}(\d{2,3}(?:\.\d{1,2})?)/i)
      const diesel = html.match(/Diesel[^0-9]{0,40}(\d{2,3}(?:\.\d{1,2})?)/i)
      const now = new Date().toISOString()
      const out: RatePoint[] = []
      if (petrol?.[1]) {
        out.push({
          series: 'petrol_super',
          value: Number(petrol[1]),
          unit: 'PKR/L',
          source: 'ogra.org.pk',
          observedAt: now,
        })
      }
      if (diesel?.[1]) {
        out.push({
          series: 'hsd',
          value: Number(diesel[1]),
          unit: 'PKR/L',
          source: 'ogra.org.pk',
          observedAt: now,
        })
      }
      return out
    } catch (e) {
      logger.debug({ err: e }, 'OGRA fetch skipped')
      return []
    }
  },
}

/** Local gold board estimate from international spot × USD/PKR. */
export const sarafaAdapter: RateSourceAdapter = {
  id: 'sarafa',
  fetch: async () => {
    try {
      const [spotRes, pkr] = await Promise.all([
        fetch('https://api.metals.live/v1/spot/gold', {
          signal: AbortSignal.timeout(12_000),
          headers: { Accept: 'application/json' },
        }),
        fetchUsdPkr(),
      ])
      if (!spotRes.ok || !pkr) return []
      const spot = (await spotRes.json()) as unknown
      // metals.live returns [[ts, price], ...] or {price}
      let usdPerOz: number | undefined
      if (Array.isArray(spot) && Array.isArray(spot[0])) {
        usdPerOz = Number(spot[0][1])
      } else if (spot && typeof spot === 'object' && 'price' in spot) {
        usdPerOz = Number((spot as { price: number }).price)
      }
      if (!usdPerOz || !Number.isFinite(usdPerOz)) return []
      const gramsPerTola = 11.664
      const ozToGram = 31.1034768
      const pkrPerTola = (usdPerOz / ozToGram) * gramsPerTola * pkr
      return [
        {
          series: 'gold_24k_tola',
          value: Math.round(pkrPerTola),
          unit: 'PKR/tola',
          source: 'metals.live×fx',
          observedAt: new Date().toISOString(),
          city: 'Karachi',
        },
      ]
    } catch (e) {
      logger.debug({ err: e }, 'Sarafa/gold estimate skipped')
      return []
    }
  },
}

async function goldFromInternationalApi(env: WorkerEnv): Promise<RatePoint[]> {
  if (!env.GOLD_API_URL) return []
  try {
    const res = await fetch(env.GOLD_API_URL, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return []
    const data = (await res.json()) as { price?: number; currency?: string }
    const usdPerOz = data.price
    if (!usdPerOz) return []
    const pkr = (await fetchUsdPkr()) ?? 280
    const gramsPerTola = 11.664
    const ozToGram = 31.1034768
    const pkrPerTola = (usdPerOz / ozToGram) * gramsPerTola * pkr
    return [
      {
        series: 'gold_24k_tola',
        value: Math.round(pkrPerTola),
        unit: 'PKR/tola',
        source: 'gold-api-estimate',
        observedAt: new Date().toISOString(),
      },
    ]
  } catch (e) {
    logger.warn({ err: e }, 'GOLD_API_URL fetch failed')
    return []
  }
}

export async function fetchRatePoints(env: WorkerEnv, adapters: RateSourceAdapter[] = []): Promise<RatePoint[]> {
  const all: RatePoint[] = []
  all.push(...(await goldFromInternationalApi(env)))
  for (const a of [...adapters, sbpAdapter, ograAdapter, sarafaAdapter]) {
    try {
      all.push(...(await a.fetch()))
    } catch (e) {
      logger.warn({ adapter: a.id, err: e }, 'rate adapter failed')
    }
  }
  return all
}

export async function postRatePoints(payload: PayloadClient, points: RatePoint[]): Promise<void> {
  if (points.length === 0) return
  try {
    await payload.postDataPoints(points)
  } catch (e) {
    logger.warn({ count: points.length, err: e }, 'data-point post failed')
  }
}
