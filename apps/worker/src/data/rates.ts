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

/** TODO: official SBP interbank feed adapter. */
export const sbpAdapter: RateSourceAdapter = {
  id: 'sbp',
  fetch: async () => {
    logger.debug('SBP adapter not implemented')
    return []
  },
}

/** TODO: OGRA petrol notification adapter. */
export const ograAdapter: RateSourceAdapter = {
  id: 'ogra',
  fetch: async () => [],
}

/** TODO: Sarafa/local gold board adapter. */
export const sarafaAdapter: RateSourceAdapter = {
  id: 'sarafa',
  fetch: async () => [],
}

async function goldFromInternationalApi(env: WorkerEnv): Promise<RatePoint[]> {
  if (!env.GOLD_API_URL) return []
  try {
    const res = await fetch(env.GOLD_API_URL, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return []
    const data = (await res.json()) as { price?: number; currency?: string }
    const usdPerOz = data.price
    if (!usdPerOz) return []
    const usdPkr = 280 // placeholder until wired to usd series
    const gramsPerTola = 11.664
    const ozToGram = 31.1034768
    const pkrPerTola = (usdPerOz / ozToGram) * gramsPerTola * usdPkr
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
    logger.warn({ err: e }, 'data-points post failed')
  }
}
