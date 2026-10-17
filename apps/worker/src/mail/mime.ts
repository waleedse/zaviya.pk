/**
 * Just enough MIME for commands typed in Gmail, Outlook and iPhone Mail: headers (kept in order and
 * duplicates preserved, because sender authentication reads the Received chain), the plain-text body of
 * multipart / quoted-printable / base64 messages, RFC 2047 words, and quoted-history trimming.
 * Ported from ops/bin/mail.mjs.
 */

export interface RawHeader {
  name: string
  value: string
}

export interface ParsedMail {
  /** Every header in file order (top = added last), folded lines joined */
  headers: RawHeader[]
  from: string
  /** Lower-cased address of From when it holds exactly one, else null */
  fromAddress: string | null
  subject: string
  messageId: string | null
  references: string | null
  /** Plain text with the quoted history and signature lines removed */
  text: string
  /** Plain text exactly as decoded */
  fullText: string
}

function splitMessage(text: string): { headers: RawHeader[]; body: string } {
  const at = text.search(/\r?\n\r?\n/)
  const head = at < 0 ? text : text.slice(0, at)
  const body = at < 0 ? '' : text.slice(at).replace(/^\r?\n\r?\n/, '')
  const headers: RawHeader[] = []
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const k = line.indexOf(':')
    if (k > 0) headers.push({ name: line.slice(0, k).trim().toLowerCase(), value: line.slice(k + 1).trim() })
  }
  return { headers, body }
}

export function header(headers: RawHeader[], name: string): string | undefined {
  return headers.find((h) => h.name === name)?.value
}

function qpBytes(s: string): Buffer {
  const joined = s.replace(/=\r?\n/g, '')
  const out: number[] = []
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i]!
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      out.push(parseInt(joined.slice(i + 1, i + 3), 16))
      i += 2
    } else {
      out.push(joined.charCodeAt(i) & 0xff)
    }
  }
  return Buffer.from(out)
}

function decodeCharset(buf: Buffer, charset: string): string {
  const cs = charset.toLowerCase().replace(/^"|"$/g, '')
  try {
    return new TextDecoder(/^(utf-?8|us-ascii)$/.test(cs) ? 'utf-8' : cs).decode(buf)
  } catch {
    return buf.toString('utf8')
  }
}

/** RFC 2047 "=?utf-8?B?...?=" words; whitespace between two adjacent words is dropped */
export function decodeWords(s = ''): string {
  return s
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, enc: string, txt: string) => {
      const buf = enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64') : qpBytes(txt.replace(/_/g, ' '))
      return decodeCharset(buf, cs)
    })
}

function decodeBody(body: string, headers: RawHeader[]): string {
  const enc = (header(headers, 'content-transfer-encoding') ?? '').toLowerCase()
  const cs = /charset="?([^";\s]+)/i.exec(header(headers, 'content-type') ?? '')?.[1] ?? 'utf-8'
  let buf: Buffer
  if (enc === 'base64') buf = Buffer.from(body.replace(/\s+/g, ''), 'base64')
  else if (enc === 'quoted-printable') buf = qpBytes(body)
  else buf = Buffer.from(body, 'latin1')
  return decodeCharset(buf, cs)
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

function textPart(text: string, depth = 0): string {
  const { headers, body } = splitMessage(text)
  const ct = header(headers, 'content-type') ?? 'text/plain'
  const boundary = /boundary="?([^";]+)"?/i.exec(ct)?.[1]
  if (/^multipart\//i.test(ct) && boundary && depth < 6) {
    const parts = body
      .split(`--${boundary}`)
      .slice(1)
      .filter((p) => !p.startsWith('--'))
      .map((p) => p.replace(/^\r?\n/, ''))
      .map((p) => ({ p, ct: header(splitMessage(p).headers, 'content-type') ?? 'text/plain' }))
    const pick =
      parts.find((x) => /^text\/plain/i.test(x.ct)) ??
      parts.find((x) => /^multipart\//i.test(x.ct)) ??
      parts.find((x) => /^text\/html/i.test(x.ct))
    return pick ? textPart(pick.p, depth + 1) : ''
  }
  if (/^(image|audio|video|application)\//i.test(ct)) return ''
  const decoded = decodeBody(body, headers)
  return /^text\/html/i.test(ct) ? htmlToText(decoded) : decoded
}

/** Drops quoted history ("On ... wrote:", Outlook's From: block, "> " lines) and phone signatures. */
export function trimQuoted(t: string): string {
  const lines = t.replace(/\r\n/g, '\n').split('\n')
  const isCut = (l: string, i: number) =>
    /^On .+wrote:\s*$/.test(l) ||
    // Gmail wraps long attributions: "On Sat, 17 Oct 2026 at 10:00, X <a@b>" / "wrote:"
    (/^On .+[,>]\s*$/.test(l) && /^.*wrote:\s*$/.test(lines[i + 1] ?? '')) ||
    /^-{2,}\s*(Original Message|Forwarded message)/i.test(l) ||
    (/^From:\s/.test(l) && i > 0 && /^\s*$/.test(lines[i - 1] ?? '')) ||
    /^_{10,}\s*$/.test(l) ||
    /^Sent from my (iPhone|iPad|Android|mobile|Galaxy)/i.test(l) ||
    /^Get Outlook for /i.test(l)
  const cut = lines.findIndex(isCut)
  return (cut >= 0 ? lines.slice(0, cut) : lines)
    .filter((l) => !l.startsWith('>'))
    .join('\n')
    .trim()
}

/** Single address from a From header, lower-cased; null when there is none or more than one */
export function singleAddress(fromHeader: string): string | null {
  const found = [...fromHeader.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)].map((m) => m[1]!)
  const list = found.length ? found : /^[^\s<>,;"]+@[^\s<>,;"]+$/.test(fromHeader.trim()) ? [fromHeader.trim()] : []
  if (list.length !== 1) return null
  if (!found.length && /[,;]/.test(fromHeader)) return null
  // "a@b.pk, c@d.pk" inside display-name tricks: more than one @-address token outside <> means ambiguous
  if (found.length === 1 && /,/.test(fromHeader.replace(/"[^"]*"/g, '').replace(/<[^>]*>/g, ''))) return null
  return list[0]!.toLowerCase()
}

export function parseMail(raw: Buffer | string): ParsedMail {
  const text = typeof raw === 'string' ? raw : raw.toString('latin1')
  const { headers } = splitMessage(text)
  const fromRaw = decodeWords(header(headers, 'from') ?? '')
  const full = textPart(text).replace(/\r\n/g, '\n')
  return {
    headers,
    from: fromRaw,
    // The address is read from the raw header, never from a decoded display name
    fromAddress: singleAddress(header(headers, 'from') ?? ''),
    subject: decodeWords(header(headers, 'subject') ?? ''),
    messageId: header(headers, 'message-id') ?? null,
    references: header(headers, 'references') ?? null,
    text: trimQuoted(full),
    fullText: full.trim(),
  }
}
