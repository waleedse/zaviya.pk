#!/usr/bin/env node
// Email for the Zaviya agents (@zaviya.pk, our own mail server), with no dependencies and no password on the command line.
//   mail.mjs send --to waleed@zaviya.pk --subject "SEO weekly plan" --body-file plan.md [--reply-to-id "<msg-id>"]
//   mail.mjs inbox [--all] [--from waleed@zaviya.pk]   unread (or all) mail, newest first: uid, date, from, subject
//   mail.mjs read <uid>                                 headers + plain-text body (quoted history trimmed); does not mark it read
//   mail.mjs seen <uid>                                 mark as read once handled
// Account: MAIL_USER / MAIL_PASSWORD from the environment or ~/.zaviya-agents/.env (e.g. MAIL_USER=seo@zaviya.pk).
// Server: MAIL_HOST (default mail.zaviya.pk), SMTP 465 (TLS), IMAP 993 (TLS).
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import tls from 'node:tls'

function fromFile(name) {
  for (const file of [process.env.ZAVIYA_AGENT_ENV, `${homedir()}/.zaviya-agents/.env`, '/data/.env'].filter(Boolean)) {
    if (!existsSync(file)) continue
    const m = readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}
const env = (n, d) => process.env[n] || fromFile(n) || d
const HOST = env('MAIL_HOST', 'mail.zaviya.pk')
const USER = env('MAIL_USER')
const PASS = env('MAIL_PASSWORD')

function args(list) {
  const out = { _: [] }
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith('--')) {
      const k = list[i].slice(2)
      out[k] = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true
    } else out._.push(list[i])
  }
  return out
}

/** A line-oriented TLS conversation: `expect` waits until `done(buffer)` says the reply is complete. */
function connect(port) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: HOST, port, servername: HOST, timeout: 30_000 }, () => resolve(conv))
    let buf = Buffer.alloc(0)
    let waiter = null
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d])
      if (waiter && waiter.done(buf)) {
        const w = waiter
        waiter = null
        const out = buf
        buf = Buffer.alloc(0)
        w.resolve(out)
      }
    })
    sock.on('error', (e) => (waiter ? waiter.reject(e) : reject(e)))
    sock.on('timeout', () => sock.destroy(new Error('mail server timeout')))
    const conv = {
      expect(done, send) {
        return new Promise((res, rej) => {
          waiter = { done, resolve: res, reject: rej }
          if (send !== undefined) sock.write(send)
          else if (done(buf)) {
            waiter = null
            const out = buf
            buf = Buffer.alloc(0)
            res(out)
          }
        })
      },
      end: () => sock.end(),
    }
  })
}

// ---------- SMTP ----------
const smtpDone = (b) => /(^|\r\n)\d{3} [^\r\n]*\r\n$/.test(b.toString('latin1'))
async function smtp(conv, line, ok) {
  const r = (await conv.expect(smtpDone, line === null ? undefined : `${line}\r\n`)).toString('utf8')
  const last = r.trim().split('\r\n').pop() ?? ''
  const code = Number(last.slice(0, 3))
  if (!ok.includes(code)) throw new Error(`SMTP ${line === null ? 'greeting' : line.startsWith('AUTH') ? 'AUTH' : line.split(' ')[0]}: ${last}`)
  return r
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)

async function send(a) {
  if (!a.to || !a.subject || !a['body-file']) throw new Error('send needs --to, --subject and --body-file')
  const body = readFileSync(a['body-file'], 'utf8')
  const id = `<${randomUUID()}@zaviya.pk>`
  const headers = [
    `From: Zaviya ${encWord(a.name || 'Agent')} <${USER}>`,
    `To: <${a.to}>`,
    `Subject: ${encWord(a.subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${id}`,
    ...(a['reply-to-id'] ? [`In-Reply-To: ${a['reply-to-id']}`, `References: ${a['reply-to-id']}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ]
  // base64 lines never start with ".", so no dot-stuffing is needed
  const data = `${headers.join('\r\n')}\r\n\r\n${b64(body).replace(/.{1,76}/g, '$&\r\n')}.`
  const c = await connect(465)
  await smtp(c, null, [220])
  await smtp(c, 'EHLO agents.zaviya.pk', [250])
  await smtp(c, `AUTH PLAIN ${Buffer.from(`\0${USER}\0${PASS}`).toString('base64')}`, [235])
  await smtp(c, `MAIL FROM:<${USER}>`, [250])
  await smtp(c, `RCPT TO:<${a.to}>`, [250, 251])
  await smtp(c, 'DATA', [354])
  await smtp(c, data, [250])
  await smtp(c, 'QUIT', [221]).catch(() => {})
  c.end()
  console.log(`sent ${id} to ${a.to}`)
}

// ---------- IMAP ----------
let tagN = 0
async function imap(conv, cmd) {
  const tag = `Z${++tagN}`
  const done = (b) => {
    const s = b.toString('latin1')
    // a literal {n} may contain "Zx OK" text; only accept the tagged line at the very end
    return new RegExp(`(^|\\r\\n)${tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n$`).test(s)
  }
  const raw = await conv.expect(done, `${tag} ${cmd}\r\n`)
  const s = raw.toString('latin1')
  const status = new RegExp(`${tag} (OK|NO|BAD)([^\\r\\n]*)\\r\\n$`).exec(s)
  if (!status || status[1] !== 'OK') throw new Error(`IMAP ${cmd.split(' ')[0]}: ${status ? status[1] + status[2] : 'no reply'}`)
  return raw
}
const q = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`
async function imapOpen() {
  if (!USER || !PASS) throw new Error('MAIL_USER / MAIL_PASSWORD are not set (env or ~/.zaviya-agents/.env)')
  const c = await connect(993)
  await c.expect((b) => /\r\n$/.test(b.toString('latin1')))
  await imap(c, `LOGIN ${q(USER)} ${q(PASS)}`)
  await imap(c, 'SELECT INBOX')
  return c
}

/** Pulls the literal message bytes out of a FETCH reply. */
function literals(raw) {
  const out = []
  const s = raw.toString('latin1')
  const re = /\{(\d+)\}\r\n/g
  let m
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length
    const n = Number(m[1])
    out.push({ head: s.slice(s.lastIndexOf('* ', m.index), m.index), bytes: raw.subarray(start, start + n) })
    re.lastIndex = start + n
  }
  return out
}

// ---------- MIME (just enough for replies from Outlook, Gmail and phones) ----------
function splitMessage(text) {
  const at = text.search(/\r?\n\r?\n/)
  const head = at < 0 ? text : text.slice(0, at)
  const body = at < 0 ? '' : text.slice(at).replace(/^\r?\n\r?\n/, '')
  const headers = {}
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const k = line.indexOf(':')
    if (k > 0) headers[line.slice(0, k).toLowerCase()] ??= line.slice(k + 1).trim()
  }
  return { headers, body }
}
function decodeWords(s = '') {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    const buf = enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64') : Buffer.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1')
    return new TextDecoder(/utf-?8/i.test(cs) ? 'utf-8' : 'latin1').decode(buf)
  })
}
function decodeBody(body, headers) {
  const enc = (headers['content-transfer-encoding'] || '').toLowerCase()
  const cs = /charset="?([^";\s]+)/i.exec(headers['content-type'] || '')?.[1] || 'utf-8'
  let buf
  if (enc === 'base64') buf = Buffer.from(body.replace(/\s+/g, ''), 'base64')
  else if (enc === 'quoted-printable') buf = Buffer.from(body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1')
  else buf = Buffer.from(body, 'latin1')
  try {
    return new TextDecoder(cs.toLowerCase()).decode(buf)
  } catch {
    return buf.toString('utf8')
  }
}
function textPart(text) {
  const { headers, body } = splitMessage(text)
  const ct = headers['content-type'] || 'text/plain'
  const boundary = /boundary="?([^";]+)"?/i.exec(ct)?.[1]
  if (/^multipart\//i.test(ct) && boundary) {
    const parts = body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith('--'))
    const plain = parts.map((p) => p.replace(/^\r?\n/, '')).map((p) => ({ p, h: splitMessage(p).headers['content-type'] || '' }))
    const pick = plain.find((x) => /^text\/plain/i.test(x.h)) || plain.find((x) => /^multipart\//i.test(x.h)) || plain.find((x) => /^text\/html/i.test(x.h))
    return pick ? textPart(pick.p) : ''
  }
  const decoded = decodeBody(body, headers)
  return /^text\/html/i.test(ct) ? decoded.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&') : decoded
}
/** Drops the quoted history under "On ... wrote:" / Outlook's "From:" block / ">" lines. */
function trimQuoted(t) {
  const lines = t.replace(/\r\n/g, '\n').split('\n')
  // Outlook for iOS glues "Get Outlook for iOS" to the quoted mail with no line break, so that line starts the history
  const cut = lines.findIndex((l, i) => /^On .+wrote:\s*$/.test(l) || (/^-{2,}\s*Original Message/i.test(l)) || (/^From:\s/.test(l) && i > 0 && /^\s*$/.test(lines[i - 1] ?? '')) || /^_{10,}/.test(l) || /^Get Outlook for /i.test(l) || /^Sent from my (iPhone|iPad|Android|mobile|Galaxy)/i.test(l))
  return (cut >= 0 ? lines.slice(0, cut) : lines).filter((l) => !l.startsWith('>')).join('\n').trim()
}

async function inbox(a) {
  const c = await imapOpen()
  const crit = [a.all ? 'ALL' : 'UNSEEN', ...(a.from ? [`FROM ${q(a.from)}`] : [])].join(' ')
  const r = (await imap(c, `UID SEARCH ${crit}`)).toString('latin1')
  const uids = (/\* SEARCH([\d ]*)/.exec(r)?.[1] ?? '').trim().split(/\s+/).filter(Boolean).map(Number).sort((x, y) => y - x).slice(0, 30)
  if (!uids.length) {
    console.log(a.all ? 'inbox is empty' : 'no unread mail')
  } else {
    const raw = await imap(c, `UID FETCH ${uids.join(',')} (UID BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])`)
    for (const { head, bytes } of literals(raw)) {
      const uid = /UID (\d+)/.exec(head)?.[1]
      const { headers } = splitMessage(bytes.toString('utf8') + '\r\n\r\n')
      console.log(`${uid}\t${headers.date ?? ''}\t${decodeWords(headers.from)}\t${decodeWords(headers.subject)}`)
    }
  }
  await imap(c, 'LOGOUT').catch(() => {})
  c.end()
}

async function read(a) {
  const uid = Number(a._[1])
  if (!uid) throw new Error('usage: mail.mjs read <uid>')
  const c = await imapOpen()
  const lit = literals(await imap(c, `UID FETCH ${uid} (UID BODY.PEEK[])`))[0]
  await imap(c, 'LOGOUT').catch(() => {})
  c.end()
  if (!lit) throw new Error(`no message with uid ${uid}`)
  const text = lit.bytes.toString('latin1')
  const { headers } = splitMessage(text)
  console.log(`From: ${decodeWords(headers.from)}\nDate: ${headers.date ?? ''}\nSubject: ${decodeWords(headers.subject)}\nMessage-ID: ${headers['message-id'] ?? ''}\n`)
  const body = textPart(text)
  console.log(a.full ? body.trim() : trimQuoted(body))
}

async function seen(a) {
  const uid = Number(a._[1])
  if (!uid) throw new Error('usage: mail.mjs seen <uid>')
  const c = await imapOpen()
  await imap(c, `UID STORE ${uid} +FLAGS (\\Seen)`)
  await imap(c, 'LOGOUT').catch(() => {})
  c.end()
  console.log(`marked ${uid} as read`)
}

const a = args(process.argv.slice(2))
const cmd = a._[0]
const run = { send, inbox, read, seen }[cmd]
if (!run) {
  console.error('usage: mail.mjs send|inbox|read|seen (see the header of ops/bin/mail.mjs)')
  process.exit(2)
}
if (cmd === 'send' && (!USER || !PASS)) {
  console.error('MAIL_USER / MAIL_PASSWORD are not set (env or ~/.zaviya-agents/.env)')
  process.exit(1)
}
run(a).catch((e) => {
  console.error(`mail.mjs ${cmd}: ${e.message}`)
  process.exit(1)
})
