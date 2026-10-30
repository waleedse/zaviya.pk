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
  /** Share-button clicks by source ('whatsapp-share', 'facebook-share', ...) over the window (kept apart from pageviews) */
  shareClicks: Record<string, number>
  /** Suspected scraper hits per PKT day (ZAV-260), counted apart from pageviews and visitors */
  bots: { day: string; hits: number }[]
  botTotal: number
}

/** Folds (day, source) rows into the per-day report; visitors per day are the sum of per-source uniques (a visitor seen from two sources counts twice). */
export function shapeReport(days: number, dayList: string[], rows: PageviewRow[], referrers: { host: string; pv: number }[], shares: { source: string; n: number }[] = [], botRows: { day: string; n: number }[] = []): PageviewsReport {
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
  const bots = dayList.map((day) => ({ day, hits: botRows.filter((b) => b.day === day).reduce((a, b) => a + b.n, 0) }))
  return { timezone: 'Asia/Karachi', days, daily, bots, botTotal: bots.reduce((a, b) => a + b.hits, 0), totalsBySource, topReferrers: referrers.map((r) => ({ host: r.host, pageviews: r.pv })), shareClicks: Object.fromEntries(shares.map((r) => [r.source, r.n])) }
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
      WHERE ts >= ((now() AT TIME ZONE 'Asia/Karachi')::date - ${n - 1}::int)::timestamp AT TIME ZONE 'Asia/Karachi'
      GROUP BY 1, 2 ORDER BY 1, 2`,
  )
  const refs = await run<{ host: string; pv: string }>(
    sql`SELECT ref_host AS host, count(*) AS pv FROM zaviya_pageviews
      WHERE ts >= now() - ${n}::int * interval '1 day' AND ref_host IS NOT NULL AND source <> 'internal'
      GROUP BY 1 ORDER BY pv DESC LIMIT 25`,
  )
  const shares = await run<{ source: string; n: string }>(
    sql`SELECT source, count(*) AS n FROM zaviya_share_clicks WHERE ts >= now() - ${n}::int * interval '1 day' GROUP BY 1 ORDER BY n DESC`,
  )
  const botRows = await run<{ day: string; n: string }>(
    sql`SELECT (ts AT TIME ZONE 'Asia/Karachi')::date::text AS day, count(*) AS n FROM zaviya_bot_hits
      WHERE ts >= ((now() AT TIME ZONE 'Asia/Karachi')::date - ${n - 1}::int)::timestamp AT TIME ZONE 'Asia/Karachi'
      GROUP BY 1`,
  ).catch(() => [])
  return shapeReport(
    n,
    dayRows.map((r) => r.day),
    rows.map((r) => ({ day: r.day, source: r.source, pv: Number(r.pv), uv: Number(r.uv) })),
    refs.map((r) => ({ host: r.host, pv: Number(r.pv) })),
    shares.map((r) => ({ source: r.source, n: Number(r.n) })),
    botRows.map((r) => ({ day: r.day, n: Number(r.n) })),
  )
}
