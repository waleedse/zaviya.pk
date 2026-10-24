/**
 * Dependency-free IMAP (993) and SMTP (465) over TLS, ported from ops/bin/mail.mjs.
 * Chosen over imapflow + nodemailer: the commands needed are five (LOGIN, SELECT, UID SEARCH, UID FETCH, UID STORE)
 * and the same code already runs the agents' mail daily, and it adds no new dependency to the lockfile.
 */
import tls from 'node:tls'
import { randomUUID } from 'node:crypto'

export interface MailAccount {
  host: string
  user: string
  password: string
}

export interface Mailbox {
  /** UIDs of unread mail, ascending */
  listUnseen(): Promise<number[]>
  fetchRaw(uid: number): Promise<Buffer>
  markSeen(uid: number): Promise<void>
  close(): Promise<void>
}

export interface OutgoingMail {
  to: string
  subject: string
  body: string
  inReplyTo?: string | null
  references?: string | null
  /** Newsletter mail (ZAV-109): sender name instead of "Zaviya Ops", extra headers such as List-Unsubscribe, instead of Auto-Submitted */
  bulk?: { fromName: string; headers: Record<string, string> }
  /** Files to attach (multipart/mixed); the content is base64 already */
  attachments?: { filename: string; contentType: string; base64: string }[]
}

export interface Mailer {
  /** Returns the Message-ID of the sent mail */
  send(mail: OutgoingMail): Promise<string>
}

interface Conv {
  expect(done: (b: Buffer) => boolean, send?: string): Promise<Buffer>
  end(): void
}

function connect(account: MailAccount, port: number): Promise<Conv> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: account.host, port, servername: account.host, timeout: 30_000 }, () => resolve(conv))
    let buf: Buffer = Buffer.alloc(0)
    let waiter: { done: (b: Buffer) => boolean; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null = null
    sock.on('data', (d: Buffer) => {
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
    const conv: Conv = {
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

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
const encWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)
/** Header values may not contain line breaks (injection guard) */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

// ---------- SMTP ----------
const smtpDone = (b: Buffer) => /(^|\r\n)\d{3} [^\r\n]*\r\n$/.test(b.toString('latin1'))

async function smtpCmd(conv: Conv, line: string | null, ok: number[]): Promise<void> {
  const r = (await conv.expect(smtpDone, line === null ? undefined : `${line}\r\n`)).toString('utf8')
  const last = r.trim().split('\r\n').pop() ?? ''
  const code = Number(last.slice(0, 3))
  if (!ok.includes(code)) {
    const what = line === null ? 'greeting' : line.startsWith('AUTH') ? 'AUTH' : line.split(' ')[0]
    throw new Error(`SMTP ${what}: ${last}`)
  }
}

const wrap76 = (b64text: string) => b64text.replace(/.{1,76}/g, '$&\r\n')
/** Header parameter values (file names) keep to a safe ASCII subset */
const safeName = (s: string) => oneLine(s).replace(/[^\w.\- ]/g, '_').slice(0, 80) || 'file'

/** Plain-text mail with the right threading headers; base64 body so dots and Urdu are safe. With attachments: multipart/mixed. */
export function buildMessage(from: string, mail: OutgoingMail, id: string, date = new Date()): string {
  const attachments = mail.attachments ?? []
  const boundary = `zaviya_${id.replace(/[^\w]/g, '').slice(0, 24)}_mix`
  const headers = [
    `From: ${mail.bulk ? oneLine(mail.bulk.fromName).replace(/[<>"]/g, '') : 'Zaviya Ops'} <${from}>`,
    `To: <${oneLine(mail.to)}>`,
    `Subject: ${encWord(oneLine(mail.subject))}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${id}`,
    ...(mail.inReplyTo
      ? [`In-Reply-To: ${oneLine(mail.inReplyTo)}`, `References: ${oneLine([mail.references, mail.inReplyTo].filter(Boolean).join(' '))}`]
      : []),
    ...(mail.bulk
      ? [...Object.entries(mail.bulk.headers).map(([k, v]) => `${oneLine(k).replace(/[^\w-]/g, '')}: ${oneLine(v)}`)]
      : ['Auto-Submitted: auto-replied']),
    'MIME-Version: 1.0',
  ]
  if (!attachments.length) {
    return `${[...headers, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64'].join('\r\n')}\r\n\r\n${wrap76(b64(mail.body))}`
  }
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(mail.body)),
    ...attachments.flatMap((a) => {
      const name = safeName(a.filename)
      return [
        `--${boundary}`,
        `Content-Type: ${oneLine(a.contentType).replace(/[^\w/.+-]/g, '')}; name="${name}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${name}"`,
        '',
        wrap76(a.base64.replace(/[^A-Za-z0-9+/=]/g, '')),
      ]
    }),
    `--${boundary}--`,
    '',
  ]
  return `${[...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`].join('\r\n')}\r\n\r\n${parts.join('\r\n')}`
}

export function smtpMailer(account: MailAccount): Mailer {
  return {
    async send(mail) {
      const id = `<${randomUUID()}@zaviya.pk>`
      const data = `${buildMessage(account.user, mail, id)}.`
      const c = await connect(account, 465)
      try {
        await smtpCmd(c, null, [220])
        await smtpCmd(c, 'EHLO ops.zaviya.pk', [250])
        await smtpCmd(c, `AUTH PLAIN ${Buffer.from(`\0${account.user}\0${account.password}`).toString('base64')}`, [235])
        await smtpCmd(c, `MAIL FROM:<${account.user}>`, [250])
        await smtpCmd(c, `RCPT TO:<${oneLine(mail.to)}>`, [250, 251])
        await smtpCmd(c, 'DATA', [354])
        await smtpCmd(c, data, [250])
        await smtpCmd(c, 'QUIT', [221]).catch(() => {})
      } finally {
        c.end()
      }
      return id
    },
  }
}

// ---------- IMAP ----------
const q = (s: string) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`

/** Pulls the literal message bytes out of a FETCH reply */
export function literals(raw: Buffer): { head: string; bytes: Buffer }[] {
  const out: { head: string; bytes: Buffer }[] = []
  const s = raw.toString('latin1')
  const re = /\{(\d+)\}\r\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length
    const n = Number(m[1])
    out.push({ head: s.slice(s.lastIndexOf('* ', m.index), m.index), bytes: raw.subarray(start, start + n) })
    re.lastIndex = start + n
  }
  return out
}

export async function openMailbox(account: MailAccount): Promise<Mailbox> {
  const c = await connect(account, 993)
  let tagN = 0
  const cmd = async (command: string, label = command.split(' ')[0]): Promise<Buffer> => {
    const tag = `Z${++tagN}`
    const done = (b: Buffer) => new RegExp(`(^|\\r\\n)${tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n$`).test(b.toString('latin1'))
    const raw = await c.expect(done, `${tag} ${command}\r\n`)
    const status = new RegExp(`${tag} (OK|NO|BAD)([^\\r\\n]*)\\r\\n$`).exec(raw.toString('latin1'))
    if (!status || status[1] !== 'OK') throw new Error(`IMAP ${label}: ${status ? status[1] + status[2] : 'no reply'}`)
    return raw
  }
  await c.expect((b) => /\r\n$/.test(b.toString('latin1')))
  // the password is only ever sent, never logged: errors carry the command label, not the command
  await cmd(`LOGIN ${q(account.user)} ${q(account.password)}`, 'LOGIN')
  await cmd('SELECT INBOX')
  return {
    async listUnseen() {
      const r = (await cmd('UID SEARCH UNSEEN')).toString('latin1')
      return (/\* SEARCH([\d ]*)/.exec(r)?.[1] ?? '').trim().split(/\s+/).filter(Boolean).map(Number).sort((a, b) => a - b)
    },
    async fetchRaw(uid) {
      const lit = literals(await cmd(`UID FETCH ${uid} (UID BODY.PEEK[])`))[0]
      if (!lit) throw new Error(`no message with uid ${uid}`)
      return Buffer.from(lit.bytes)
    },
    async markSeen(uid) {
      await cmd(`UID STORE ${uid} +FLAGS (\\Seen)`)
    },
    async close() {
      await cmd('LOGOUT').catch(() => {})
      c.end()
    },
  }
}
