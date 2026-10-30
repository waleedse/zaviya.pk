import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { getPayloadClient } from './payload'

export type TrafficSource =
  | 'google'
  | 'discover'
  | 'google-news'
  | 'bing'
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'x'
  | 'youtube'
  | 'push'
  | 'embed'
  | 'internal'
  | 'direct'
  | 'other'

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp\/|telegrambot|preview|headless|lighthouse|pagespeed|curl|wget|python|node-fetch|axios|go-http|java\/|lightpanda|webindexer|externalagent/i

export function isBot(ua: string | null): boolean {
  return !ua || BOT_RE.test(ua)
}

/**
 * Scrapers that rotate real-looking desktop user agents (ZAV-260: ~330 one-view "direct" visitors on 30 Oct came from
 * Chrome 118-121 / Firefox 120-121 on Windows and Mac, years behind any browser a person uses in 2026). Mobile agents
 * are left alone because old Android phones are common.
 */
export function isStaleDesktopUa(ua: string): boolean {
  if (/android|mobi|iphone|ipad|tablet/i.test(ua)) return false
  const chrome = /Chrome\/(\d+)\./.exec(ua)
  if (chrome) return Number(chrome[1]) < 126
  const firefox = /Firefox\/(\d+)\./.exec(ua)
  return firefox ? Number(firefox[1]) < 128 : false
}

export type BotReason = 'no-ua' | 'known-bot' | 'stale-desktop-ua'

/** Why a hit is not a person, or null when it looks human. */
export function botReason(ua: string | null): BotReason | null {
  if (!ua) return 'no-ua'
  if (BOT_RE.test(ua)) return 'known-bot'
  if (isStaleDesktopUa(ua)) return 'stale-desktop-ua'
  return null
}

/** Bot hits are kept apart from zaviya_pageviews so they never count as direct visitors; the report shows them separately. */
export async function recordBotHit(row: { path: string; reason: BotReason; device: string }): Promise<void> {
  const payload = await getPayloadClient()
  await payload.db.drizzle.execute(sql`
    INSERT INTO zaviya_bot_hits (path, reason, device) VALUES (${row.path.slice(0, 500)}, ${row.reason}, ${row.device})
  `)
}

/** Where a visit came from, using the referrer first and utm_source as a hint. */
export function classifySource(referrer: string | undefined, utmSource: string | undefined, siteHost: string): TrafficSource {
  const utm = utmSource?.toLowerCase()
  if (utm) {
    if (utm.includes('whatsapp')) return 'whatsapp'
    if (utm.includes('facebook') || utm === 'fb') return 'facebook'
    if (utm.includes('instagram') || utm === 'ig') return 'instagram'
    if (utm === 'x' || utm.includes('twitter')) return 'x'
    if (utm.includes('push')) return 'push'
  }
  if (!referrer) return 'direct'
  let host = ''
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '')
  } catch {
    // android-app://com.google.android.googlequicksearchbox is Google Discover / the Google app
    if (/googlequicksearchbox/.test(referrer)) return 'discover'
    return 'other'
  }
  if (/googlequicksearchbox/.test(referrer)) return 'discover'
  if (host === siteHost.replace(/^www\./, '')) return 'internal'
  if (host === 'news.google.com') return 'google-news'
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google'
  if (/bing\.com$|duckduckgo\.com$|yahoo\.com$/.test(host)) return 'bing'
  if (/facebook\.com$|fb\.com$|fb\.me$/.test(host)) return 'facebook'
  if (/instagram\.com$/.test(host)) return 'instagram'
  if (/whatsapp\.com$|wa\.me$|l\.wl\.co$/.test(host)) return 'whatsapp'
  if (host === 't.co' || /(^|\.)x\.com$|twitter\.com$/.test(host)) return 'x'
  if (/youtube\.com$|youtu\.be$/.test(host)) return 'youtube'
  return 'other'
}

export function deviceFromUa(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet/i.test(ua)) return 'tablet'
  if (/mobi|android|iphone/i.test(ua)) return 'mobile'
  return 'desktop'
}

/** Daily-rotating anonymous visitor id: counts uniques without cookies or stored IPs. */
export function visitorId(ip: string, ua: string, day = new Date().toISOString().slice(0, 10)): string {
  const salt = process.env.PAYLOAD_SECRET ?? 'zaviya'
  return createHash('sha256').update(`${day}|${salt}|${ip}|${ua}`).digest('hex').slice(0, 16)
}

export async function recordPageview(row: {
  path: string
  locale?: string
  source: TrafficSource
  refHost?: string
  device: string
  country?: string
  visitor: string
}): Promise<void> {
  const payload = await getPayloadClient()
  await payload.db.drizzle.execute(sql`
    INSERT INTO zaviya_pageviews (path, locale, source, ref_host, device, country, visitor)
    VALUES (${row.path.slice(0, 500)}, ${row.locale ?? null}, ${row.source}, ${row.refHost ?? null}, ${row.device}, ${row.country ?? null}, ${row.visitor})
  `)
}

export const SHARE_CHANNELS = ['whatsapp', 'facebook', 'x', 'copy', 'native', 'picture', 'preferred_source'] as const

/** Share buttons log as '<channel>-share'; the preferred-source prompt (ZAV-241) logs as 'preferred_source_click'. */
export function shareSource(channel: string): string {
  return channel === 'preferred_source' ? 'preferred_source_click' : channel + '-share'
}

export async function recordShareClick(row: { path: string; channel: string; locale?: string; device: string }): Promise<void> {
  const payload = await getPayloadClient()
  await payload.db.drizzle.execute(sql`
    INSERT INTO zaviya_share_clicks (path, channel, source, locale, device)
    VALUES (${row.path.slice(0, 500)}, ${row.channel}, ${shareSource(row.channel)}, ${row.locale ?? null}, ${row.device})
  `)
}

/** Raw-SQL tables owned by the app (not Payload collections): created on boot. */
export const ANALYTICS_DDL = [
  sql`CREATE TABLE IF NOT EXISTS zaviya_pageviews (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    path text NOT NULL,
    locale text,
    source text NOT NULL,
    ref_host text,
    device text,
    country text,
    visitor text NOT NULL
  )`,
  sql`CREATE INDEX IF NOT EXISTS zaviya_pageviews_ts_idx ON zaviya_pageviews (ts)`,
  sql`CREATE INDEX IF NOT EXISTS zaviya_pageviews_path_ts_idx ON zaviya_pageviews (path, ts)`,
  sql`CREATE TABLE IF NOT EXISTS zaviya_bot_hits (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    path text NOT NULL,
    reason text NOT NULL,
    device text
  )`,
  sql`CREATE INDEX IF NOT EXISTS zaviya_bot_hits_ts_idx ON zaviya_bot_hits (ts)`,
  sql`CREATE TABLE IF NOT EXISTS zaviya_share_clicks (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    path text NOT NULL,
    channel text NOT NULL,
    source text NOT NULL,
    locale text,
    device text
  )`,
  sql`CREATE INDEX IF NOT EXISTS zaviya_share_clicks_ts_idx ON zaviya_share_clicks (ts)`,
  sql`CREATE TABLE IF NOT EXISTS zaviya_commands (
    id bigserial PRIMARY KEY,
    kind text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    done_at timestamptz
  )`,
  sql`CREATE INDEX IF NOT EXISTS zaviya_commands_pending_idx ON zaviya_commands (created_at) WHERE done_at IS NULL`,
]
