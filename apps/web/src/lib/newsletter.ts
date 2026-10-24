import { createHash, randomBytes } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { getPayloadClient } from './payload'

export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/

/** Max new subscriptions from one address block per hour, and in total. */
export const SUBSCRIBE_PER_IP_HOUR = 5

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null
}

export function newToken(): string {
  return randomBytes(24).toString('base64url')
}

/** The IP is never stored as such: a salted hash is enough to rate limit. */
export function ipHash(ip: string): string {
  return createHash('sha256').update(`${process.env.PAYLOAD_SECRET ?? 'zaviya'}|newsletter|${ip}`).digest('hex').slice(0, 24)
}

export type SubscribeResult = 'pending' | 'already' | 'rate-limited'

/**
 * Stores a subscriber as `pending`; the worker sends the confirmation mail (confirm_sent_at IS NULL) and only
 * confirmed addresses get the briefing. An already-confirmed address changes nothing and reveals nothing.
 */
export async function subscribe(row: { email: string; locale: string; source: string; ip: string }): Promise<SubscribeResult> {
  const payload = await getPayloadClient()
  const db = payload.db.drizzle
  const hash = ipHash(row.ip)
  const recent = await db.execute(sql`
    SELECT count(*)::int AS n FROM zaviya_newsletter_subscribers
    WHERE ip_hash = ${hash} AND created_at > now() - interval '1 hour'
  `)
  if (Number((recent.rows[0] as { n?: number } | undefined)?.n ?? 0) >= SUBSCRIBE_PER_IP_HOUR) return 'rate-limited'

  const existing = await db.execute(sql`SELECT status FROM zaviya_newsletter_subscribers WHERE email = ${row.email}`)
  const status = (existing.rows[0] as { status?: string } | undefined)?.status
  if (status === 'active') return 'already'
  if (status === 'pending') return 'pending'
  if (status === 'unsubscribed') {
    // Re-subscribing starts the double opt-in again with a fresh token.
    await db.execute(sql`
      UPDATE zaviya_newsletter_subscribers
      SET status = 'pending', token = ${newToken()}, locale = ${row.locale}, confirm_sent_at = NULL, unsubscribed_at = NULL, ip_hash = ${hash}, created_at = now()
      WHERE email = ${row.email}
    `)
    return 'pending'
  }
  await db.execute(sql`
    INSERT INTO zaviya_newsletter_subscribers (email, locale, source, token, ip_hash)
    VALUES (${row.email}, ${row.locale}, ${row.source.slice(0, 60)}, ${newToken()}, ${hash})
    ON CONFLICT (email) DO NOTHING
  `)
  return 'pending'
}

export async function confirmSubscription(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false
  const payload = await getPayloadClient()
  const res = await payload.db.drizzle.execute(sql`
    UPDATE zaviya_newsletter_subscribers
    SET status = 'active', confirmed_at = COALESCE(confirmed_at, now())
    WHERE token = ${token} AND status IN ('pending', 'active')
    RETURNING id
  `)
  return res.rows.length > 0
}

export async function unsubscribe(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false
  const payload = await getPayloadClient()
  const res = await payload.db.drizzle.execute(sql`
    UPDATE zaviya_newsletter_subscribers
    SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, now())
    WHERE token = ${token}
    RETURNING id
  `)
  return res.rows.length > 0
}

/** Raw-SQL table owned by the app (not a Payload collection): created on boot, additive and idempotent. */
export const NEWSLETTER_DDL = [
  sql`CREATE TABLE IF NOT EXISTS zaviya_newsletter_subscribers (
    id bigserial PRIMARY KEY,
    email text NOT NULL UNIQUE,
    locale text NOT NULL DEFAULT 'en',
    source text NOT NULL DEFAULT 'site',
    status text NOT NULL DEFAULT 'pending',
    token text NOT NULL UNIQUE,
    ip_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    confirm_sent_at timestamptz,
    confirmed_at timestamptz,
    unsubscribed_at timestamptz
  )`,
  sql`CREATE INDEX IF NOT EXISTS zaviya_newsletter_ip_idx ON zaviya_newsletter_subscribers (ip_hash, created_at)`,
  sql`CREATE INDEX IF NOT EXISTS zaviya_newsletter_unsent_idx ON zaviya_newsletter_subscribers (created_at) WHERE status = 'pending' AND confirm_sent_at IS NULL`,
]
