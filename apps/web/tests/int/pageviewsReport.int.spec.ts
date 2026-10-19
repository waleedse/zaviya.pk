import { describe, expect, it } from 'vitest'
import { shapeReport } from '../../src/lib/pageviews-report'

describe('pageviews report (ZAV-116)', () => {
  const days = ['2026-10-17', '2026-10-18', '2026-10-19']
  const rows = [
    { day: '2026-10-17', source: 'google', pv: 10, uv: 6 },
    { day: '2026-10-17', source: 'facebook', pv: 4, uv: 3 },
    { day: '2026-10-19', source: 'google', pv: 7, uv: 5 },
  ]
  const report = shapeReport(3, days, rows, [{ host: 'l.facebook.com', pv: 4 }])

  it('lists every day oldest first, including days with no traffic', () => {
    expect(report.daily.map((d) => d.day)).toEqual(days)
    expect(report.daily[1]).toMatchObject({ pageviews: 0, visitors: 0, bySource: {} })
  })
  it('splits each day by source and sums the totals', () => {
    expect(report.daily[0]).toMatchObject({ pageviews: 14, bySource: { google: { pageviews: 10, visitors: 6 }, facebook: { pageviews: 4, visitors: 3 } } })
    expect(report.totalsBySource).toEqual({ google: 17, facebook: 4 })
  })
  it('passes the top referrers through', () => {
    expect(report.topReferrers).toEqual([{ host: 'l.facebook.com', pageviews: 4 }])
  })
})
