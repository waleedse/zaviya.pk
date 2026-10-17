import { dnsKeyLookup, verifyDkim, type KeyLookup } from './dkim.js'
import type { ParsedMail } from './mime.js'

export const WALEED = 'waleed@zaviya.pk'
export const OUR_DOMAIN = 'zaviya.pk'

export interface AuthOptions {
  /** Accepted sender addresses (lower-case); waleed@zaviya.pk plus any test address */
  allowed: string[]
  /** DKIM key lookup (DNS in production) */
  lookup?: KeyLookup
  now?: () => number
}

export type AuthResult = { ok: true; sender: string } | { ok: false; reason: string }

/** A signed mail older than this is not acted on (limits replay of an old, genuinely signed mail) */
export const MAX_AGE_MS = 3 * 86400_000

/**
 * Accept a mail only if it names an allowed sender AND carries a valid DKIM signature of zaviya.pk that covers From.
 *
 * Checked against real mail on mail.zaviya.pk (17 Oct 2026): docker-mailserver strips the submission Received lines,
 * but rspamd signs every mail our own users send (d=zaviya.pk, s=mail). The private key never leaves the server, so
 * mail from outside cannot carry a valid signature, and SPOOF_PROTECTION=1 means an authenticated mailbox can only
 * send as its own address: a signed "From: waleed@zaviya.pk" was sent by Waleed's login.
 */
export async function authenticateSender(raw: Buffer | string, mail: ParsedMail, opts: AuthOptions): Promise<AuthResult> {
  const from = mail.fromAddress
  if (!from) return { ok: false, reason: 'From is missing or has several addresses' }
  if (!opts.allowed.includes(from)) return { ok: false, reason: `sender ${from} is not allowed` }
  if (!from.endsWith(`@${OUR_DOMAIN}`)) return { ok: false, reason: `sender ${from} is not on ${OUR_DOMAIN}` }

  const dkim = await verifyDkim(typeof raw === 'string' ? Buffer.from(raw, 'latin1') : raw, OUR_DOMAIN, opts.lookup ?? dnsKeyLookup)
  if (!dkim.ok) return { ok: false, reason: dkim.reason }

  const date = mail.headers.find((h) => h.name === 'date')?.value
  const sent = date ? Date.parse(date) : NaN
  const now = (opts.now ?? Date.now)()
  if (!Number.isFinite(sent)) return { ok: false, reason: 'no readable Date header' }
  if (now - sent > MAX_AGE_MS) return { ok: false, reason: 'mail is older than 3 days (replay guard)' }
  return { ok: true, sender: from }
}
