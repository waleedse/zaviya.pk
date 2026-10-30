import { describe, expect, it } from 'vitest'
import { botReason, isBot, isStaleDesktopUa } from '../../src/lib/analytics'
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
  it('reports share clicks apart from pageviews (ZAV-157)', () => {
    const r = shapeReport(3, days, rows, [], [{ source: 'whatsapp-share', n: 5 }])
    expect(r.shareClicks).toEqual({ 'whatsapp-share': 5 })
    expect(r.totalsBySource).toEqual({ google: 17, facebook: 4 })
    expect(report.shareClicks).toEqual({})
  })
  it('passes the top referrers through', () => {
    expect(report.topReferrers).toEqual([{ host: 'l.facebook.com', pageviews: 4 }])
  })

  it('reports suspected bot hits per day apart from pageviews (ZAV-260)', () => {
    const r = shapeReport(3, days, rows, [], [], [{ day: '2026-10-19', n: 400 }])
    expect(r.bots).toEqual([{ day: '2026-10-17', hits: 0 }, { day: '2026-10-18', hits: 0 }, { day: '2026-10-19', hits: 400 }])
    expect(r.botTotal).toBe(400)
    expect(r.daily[2]?.pageviews).toBe(7)
  })
})

describe('bot classification (ZAV-260)', () => {
  const win = (b: string) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${b}`
  it('flags the stale desktop browsers seen on 30 Oct', () => {
    expect(botReason(win('Chrome/119.0.0.0 Safari/537.36'))).toBe('stale-desktop-ua')
    expect(botReason('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe('stale-desktop-ua')
    expect(isStaleDesktopUa(win('Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.46'))).toBe(true)
  })
  it('flags Lightpanda and Meta indexers as known bots', () => {
    expect(isBot('Lightpanda/1.0')).toBe(true)
    expect(isBot(win('Chrome/145.0.0.0 Safari/537.36 (compatible; meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))'))).toBe(true)
    expect(botReason(null)).toBe('no-ua')
  })
  it('keeps current browsers and old phones as people', () => {
    expect(botReason(win('Chrome/156.0.0.0 Safari/537.36'))).toBeNull()
    expect(botReason('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0')).toBeNull()
    expect(botReason('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36')).toBeNull()
  })
})
