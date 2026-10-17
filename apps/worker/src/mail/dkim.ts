import { createHash, createPublicKey, createSign, verify, type KeyObject } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'

/**
 * DKIM verification (RFC 6376), rsa-sha256 with simple or relaxed canonicalisation. Our mail server signs every
 * message our own users send with d=zaviya.pk (selector "mail"); nobody else holds that key, so a valid signature
 * proves the mail really left our server from an authenticated mailbox. docker-mailserver strips the submission
 * Received lines, so this is the proof we have.
 */
export type KeyLookup = (selector: string, domain: string) => Promise<string | null>

export const dnsKeyLookup: KeyLookup = async (selector, domain) => {
  const recs = await resolveTxt(`${selector}._domainkey.${domain}`)
  return recs.map((r) => r.join('')).find((r) => /(^|;)\s*p=/.test(r)) ?? null
}

interface Field {
  name: string
  raw: string
}

function splitRaw(raw: Buffer): { fields: Field[]; body: string } {
  const text = raw.toString('latin1').replace(/\r?\n/g, '\r\n')
  const at = text.indexOf('\r\n\r\n')
  const head = at < 0 ? text : text.slice(0, at + 2)
  const body = at < 0 ? '' : text.slice(at + 4)
  const fields: Field[] = []
  for (const line of head.split(/(?<=\r\n)/)) {
    if (/^[ \t]/.test(line) && fields.length) fields[fields.length - 1]!.raw += line
    else if (line.includes(':')) fields.push({ name: line.slice(0, line.indexOf(':')).trim().toLowerCase(), raw: line })
  }
  return { fields, body }
}

function tags(value: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of value.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).replace(/\s+/g, '')
  }
  return out
}

const relaxedHeader = (f: Field) => {
  const value = f.raw.slice(f.raw.indexOf(':') + 1).replace(/\r\n/g, '').replace(/[ \t]+/g, ' ').trim()
  return `${f.name}:${value}\r\n`
}

export function canonBody(body: string, mode: 'simple' | 'relaxed'): string {
  let lines = body.split('\r\n')
  if (mode === 'relaxed') lines = lines.map((l) => l.replace(/[ \t]+/g, ' ').replace(/ +$/, ''))
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (!lines.length) return mode === 'simple' ? '\r\n' : ''
  return lines.join('\r\n') + '\r\n'
}

function publicKey(record: string): KeyObject {
  const t = tags(record)
  if (t.k && t.k !== 'rsa') throw new Error(`unsupported key type ${t.k}`)
  if (!t.p) throw new Error('key revoked (empty p=)')
  const der = Buffer.from(t.p, 'base64')
  try {
    return createPublicKey({ key: der, format: 'der', type: 'spki' })
  } catch {
    return createPublicKey({ key: der, format: 'der', type: 'pkcs1' })
  }
}

export type DkimResult = { ok: true; domain: string } | { ok: false; reason: string }

/** Passes when at least one DKIM-Signature for `domain` verifies and it signs the From header. */
export async function verifyDkim(raw: Buffer, domain: string, lookup: KeyLookup = dnsKeyLookup): Promise<DkimResult> {
  const { fields, body } = splitRaw(raw)
  const sigs = fields.filter((f) => f.name === 'dkim-signature')
  if (!sigs.length) return { ok: false, reason: 'no DKIM signature' }
  let last = 'no DKIM signature for our domain'
  for (const sig of sigs) {
    const value = sig.raw.slice(sig.raw.indexOf(':') + 1)
    const t = tags(value)
    if ((t.d ?? '').toLowerCase() !== domain) continue
    if (t.a !== 'rsa-sha256') {
      last = `unsupported DKIM algorithm ${t.a}`
      continue
    }
    if (t.l !== undefined) {
      last = 'DKIM l= (partial body) is not accepted'
      continue
    }
    const signed = (t.h ?? '').toLowerCase().split(':').map((s) => s.trim()).filter(Boolean)
    if (!signed.includes('from')) {
      last = 'DKIM signature does not cover From'
      continue
    }
    const [hc, bc] = ((t.c ?? 'simple/simple') + '/simple').split('/') as ['simple' | 'relaxed', 'simple' | 'relaxed']
    const bh = createHash('sha256').update(canonBody(body, bc), 'latin1').digest('base64')
    if (bh !== t.bh) {
      last = 'DKIM body hash does not match (body changed)'
      continue
    }
    // Each listed name takes the last not-yet-used instance of that header, bottom-up (RFC 6376 5.4.2)
    const used = new Set<Field>()
    let data = ''
    for (const name of signed) {
      const f = [...fields].reverse().find((x) => x.name === name && !used.has(x))
      if (!f) continue
      used.add(f)
      data += hc === 'relaxed' ? relaxedHeader(f) : f.raw
    }
    const sigField: Field = { name: sig.name, raw: sig.raw.replace(/((?:^|;)\s*b\s*=)[^;]*/, (_m, p1: string) => p1) }
    // the signature line is hashed with b= empty and without its trailing CRLF
    data += (hc === 'relaxed' ? relaxedHeader(sigField) : sigField.raw).replace(/\r\n$/, '')
    let key: KeyObject
    try {
      const rec = await lookup(t.s ?? '', domain)
      if (!rec) {
        last = `no DKIM key in DNS for ${t.s}._domainkey.${domain}`
        continue
      }
      key = publicKey(rec)
    } catch (e) {
      last = `DKIM key lookup failed: ${e instanceof Error ? e.message : String(e)}`
      continue
    }
    if (verify('RSA-SHA256', Buffer.from(data, 'latin1'), key, Buffer.from(t.b ?? '', 'base64'))) return { ok: true, domain }
    last = 'DKIM signature does not verify'
  }
  return { ok: false, reason: last }
}

/** Signs a message (relaxed/relaxed, rsa-sha256): used by the tests to build mail like mail.zaviya.pk sends. */
export function signDkim(raw: string, o: { domain: string; selector: string; privateKey: KeyObject; headers?: string[] }): string {
  const { fields, body } = splitRaw(Buffer.from(raw, 'latin1'))
  const names = o.headers ?? ['from', 'to', 'subject', 'date', 'message-id']
  const bh = createHash('sha256').update(canonBody(body, 'relaxed'), 'latin1').digest('base64')
  const unsigned = `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=${o.domain}; s=${o.selector}; h=${names.join(':')}; bh=${bh}; b=`
  const used = new Set<Field>()
  let data = ''
  for (const name of names) {
    const f = [...fields].reverse().find((x) => x.name === name && !used.has(x))
    if (!f) continue
    used.add(f)
    data += relaxedHeader(f)
  }
  data += relaxedHeader({ name: 'dkim-signature', raw: unsigned + '\r\n' }).replace(/\r\n$/, '')
  const b = createSign('RSA-SHA256').update(Buffer.from(data, 'latin1')).sign(o.privateKey, 'base64')
  const text = Buffer.from(raw, 'latin1').toString('latin1').replace(/\r?\n/g, '\r\n')
  const at = text.search(/^From:/im)
  return `${text.slice(0, at)}${unsigned}${b}\r\n${text.slice(at)}`
}
