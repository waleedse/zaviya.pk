import type { ParsedMail, RawHeader } from './mime.js'

export const WALEED = 'waleed@zaviya.pk'

export interface AuthOptions {
  /** The only server whose Received lines are trusted */
  host: string
  /** Accepted sender addresses (lower-case); waleed@zaviya.pk plus any test address */
  allowed: string[]
}

export type AuthResult = { ok: true; sender: string } | { ok: false; reason: string }

/**
 * Accept a mail only if it names an allowed sender AND our own server received it through authenticated
 * submission by that same address.
 *
 * docker-mailserver (Postfix) writes, for an authenticated submission on 465/587:
 *   Received: from [203.0.113.7] (unknown [203.0.113.7])
 *       (Authenticated sender: waleed@zaviya.pk)
 *       by mail.zaviya.pk (Postfix) with ESMTPSA id 4F2...
 * Dovecot's local delivery then adds a "... by mail.zaviya.pk with LMTP" line on top of it, which is skipped.
 * Mail that arrives from outside on port 25 has "with ESMTP" / "ESMTPS" and no "Authenticated sender", so a
 * spoofed From cannot pass. Only Received lines above the first one written by us are read (an outside sender
 * can only forge lines further down), and the line must be the first non-LMTP hop made by our own host.
 */
export function authenticateSender(mail: ParsedMail, opts: AuthOptions): AuthResult {
  const from = mail.fromAddress
  if (!from) return { ok: false, reason: 'From is missing or has several addresses' }
  if (!opts.allowed.includes(from)) return { ok: false, reason: `sender ${from} is not allowed` }

  const host = opts.host.toLowerCase()
  const received = mail.headers.filter((h: RawHeader) => h.name === 'received')
  const ours = (v: string) => new RegExp(`\\bby\\s+${host.replace(/\./g, '\\.')}\\b`, 'i').test(v)
  const hop = received.find((h) => ours(h.value) && !/\bwith\s+LMTP\b/i.test(h.value))
  if (!hop) return { ok: false, reason: 'no Received line from our own server' }

  if (!/\bwith\s+ESMTPS?A\b/i.test(hop.value)) return { ok: false, reason: 'not an authenticated submission (no ESMTPSA/ESMTPA)' }
  const who = /\(Authenticated sender:\s*([^)\s]+)\s*\)/i.exec(hop.value)?.[1]?.toLowerCase()
  if (!who) return { ok: false, reason: 'no "Authenticated sender" in the Received line' }
  if (who !== from) return { ok: false, reason: `authenticated as ${who} but From is ${from}` }
  return { ok: true, sender: from }
}
