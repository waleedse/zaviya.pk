import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

export type PageviewRow = { day: string; source: string; pv: number; uv: number }

export type PageviewsReport = {
  timezone: 'Asia/Karachi'
  days: number
  /** One entry per PKT day, oldest first, with every day present even when it had no traffic */
  daily: { day: string; pageviews: number; visitors: number; bySource: Record<string, { pageviews: number; visitors: number }> }[]
  totalsBySource: Record<string, number>
  /** Most common referring hosts over the window (ref_host as recorded, "internal" visits excluded) */
  topReferrers: { host: string; pageviews: number }[]
}

/** Folds (day, source) rows into the per-day report; visitors per day are the sum of per-source uniques (a visitor seen from two sources counts twice). */
export function shapeReport(days: number, dayList: string[], rows: PageviewRow[], referrers: { host: string; pv: number }[]): PageviewsReport {
  const totalsBySource: Record<string, number> = {}
  const daily = dayList.map((day) => {
    const mine = rows.filter((r) => r.day === day)
    const bySource: Record<string, { pageviews: number; visitors: number }> = {}
    for (const r of mine) {
      bySource[r.source] = { pageviews: r.pv, visitors: r.uv }
      totalsBySource[r.source] = (totalsBySource[r.source] ?? 0) + r.pv
    }
    return {
      day,
      pageviews: mine.reduce((a, r) => a + r.pv, 0),
      visitors: mine.reduce((a, r) => a + r.uv, 0),
      bySource,
    }
  })
  return { timezone: 'Asia/Karachi', days, daily, totalsBySource, topReferrers: referrers.map((r) => ({ host: r.host, pageviews: r.pv })) }
}

export async function pageviewsReport(payload: Payload, days: number): Promise<PageviewsReport> {
  const n = Math.min(Math.max(Math.floor(days) || 14, 1), 90)
  const run = async <T>(query: ReturnType<typeof sql>) =>
    ((await payload.db.drizzle.execute(query)) as unknown as { rows?: T[] }).rows ?? []
  const dayRows = await run<{ day: string }>(
    sql`SELECT d::date::text AS day FROM generate_series((now() AT TIME ZONE 'Asia/Karachi')::date - ${n - 1}::int, (now() AT TIME ZONE 'Asia/Karachi')::date, interval '1 day') d ORDER BY d`,
  )
  const rows = await run<{ day: string; source: string; pv: string; uv: string }>(
    sql`SELECT (ts AT TIME ZONE 'Asia/Karachi')::date::text AS day, source, count(*) AS pv, count(DISTINCT visitor) AS uv
      FROM zaviya_pageviews
      WHERE ts >= ((now() AT TIME ZONE 'Asia/Karachi')::date - ${n - 1}::int) AT TIME ZONE 'Asia/Karachi'
      GROUP BY 1, 2 ORDER BY 1, 2`,
  )
  const refs = await run<{ host: string; pv: string }>(
    sql`SELECT ref_host AS host, count(*) AS pv FROM zaviya_pageviews
      WHERE ts >= now() - ${n}::int * interval '1 day' AND ref_host IS NOT NULL AND source <> 'internal'
      GROUP BY 1 ORDER BY pv DESC LIMIT 25`,
  )
  return shapeReport(
    n,
    dayRows.map((r) => r.day),
    rows.map((r) => ({ day: r.day, source: r.source, pv: Number(r.pv), uv: Number(r.uv) })),
    refs.map((r) => ({ host: r.host, pv: Number(r.pv) })),
  )
}
