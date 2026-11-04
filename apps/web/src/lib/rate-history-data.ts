import 'server-only'
import { sql } from '@payloadcms/db-postgres'
import { unstable_cache } from 'next/cache'
import { getPayloadClient } from './payload'
import { RATE_FAMILIES, rateDayRange, summariseDay, type DayPoint, type RateFamily, type SeriesDay } from './rate-history'

export interface RateDayRow {
  date: string
  /** Last figure of the family's headline series that day, when it has one */
  headline: number | null
}

/** Days (Pakistan calendar) that hold at least one point of the family, newest first. */
async function loadRateDays(familyKey: string, limit: number): Promise<RateDayRow[]> {
  const family = RATE_FAMILIES.find((f) => f.key === familyKey)
  if (!family) return []
  const payload = await getPayloadClient()
  const list = sql.join(
    family.series.map((s) => sql`${s.series}`),
    sql`, `,
  )
  const res = (await payload.db.drizzle.execute(sql`
    SELECT d, (array_agg(value ORDER BY observed_at DESC) FILTER (WHERE series::text = ${family.headline}))[1] AS headline
    FROM (
      SELECT (observed_at AT TIME ZONE 'Asia/Karachi')::date::text AS d, series, value, observed_at
      FROM data_points
      WHERE series::text IN (${list})
    ) t
    GROUP BY d
    ORDER BY d DESC
    LIMIT ${limit}
  `)) as unknown as { rows?: { d: string; headline: string | number | null }[] }
  return (res.rows ?? []).map((r) => ({ date: r.d, headline: r.headline === null || r.headline === undefined ? null : Number(r.headline) }))
}

const cachedDays = unstable_cache(loadRateDays, ['rate-days'], { revalidate: 600, tags: ['shared-data'] })

/** Never throws: a failed read is an empty history, so a page never 500s because of it. */
export async function getRateDays(family: RateFamily, limit = 400): Promise<RateDayRow[]> {
  try {
    return await cachedDays(family.key, limit)
  } catch {
    return []
  }
}

async function loadRateDay(familyKey: string, date: string): Promise<SeriesDay[]> {
  const family = RATE_FAMILIES.find((f) => f.key === familyKey)
  if (!family) return []
  const payload = await getPayloadClient()
  const { start, end } = rateDayRange(date)
  const res = await payload.find({
    collection: 'data-points',
    where: {
      and: [
        { series: { in: family.series.map((s) => s.series) } },
        { observedAt: { greater_than_equal: start } },
        { observedAt: { less_than: end } },
      ],
    },
    sort: 'observedAt',
    limit: 2000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const points: DayPoint[] = res.docs.map((p) => ({ series: p.series, value: p.value, unit: p.unit, source: p.source, observedAt: p.observedAt }))
  return summariseDay(family, points)
}

const cachedDay = unstable_cache(loadRateDay, ['rate-day'], { revalidate: 600, tags: ['shared-data'] })

/** Figures of one Pakistan day; empty when we hold no data for it (the page then 404s). */
export async function getRateDay(family: RateFamily, date: string): Promise<SeriesDay[]> {
  try {
    return await cachedDay(family.key, date)
  } catch {
    return []
  }
}
