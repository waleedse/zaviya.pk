import { generateKeyPairSync } from 'node:crypto'
import { signDkim, type KeyLookup } from './dkim.js'

/**
 * Raw messages shaped like what mail.zaviya.pk stores for the three main clients. Like the real server (checked
 * 17 Oct 2026), mail from our own mailboxes carries only Dovecot's LMTP Received line plus rspamd's DKIM signature
 * (d=zaviya.pk). Tests sign with a throwaway key and resolve it through TEST_KEY_LOOKUP.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const TEST_P = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
export const TEST_KEY_LOOKUP: KeyLookup = async (s, d) => (s === 'mail' && d === 'zaviya.pk' ? `v=DKIM1; k=rsa; p=${TEST_P}` : null)

/** Signs as our server does (pass `domain` to sign as someone else) */
export const signed = (raw: string, domain = 'zaviya.pk') => signDkim(raw, { domain, selector: 'mail', privateKey })

const LMTP_HOP = `Received: from mail.zaviya.pk\r\n\tby mail.zaviya.pk with LMTP id aBcD1234\r\n\tfor <ops@zaviya.pk>; Sat, 17 Oct 2026 10:00:02 +0500\r\n`
const OUTSIDE_HOP = `Received: from evil.example (evil.example [203.0.113.9])\r\n\tby mail.zaviya.pk (Postfix) with ESMTPS id 99ZZ\r\n\tfor <ops@zaviya.pk>; Sat, 17 Oct 2026 10:00:01 +0500 (PKT)\r\n`
const date = () => `Date: ${new Date().toUTCString()}\r\n`

export const gmail = (from = 'Waleed <waleed@zaviya.pk>') =>
  signed(`${LMTP_HOP}Return-Path: <waleed@zaviya.pk>\r\nFrom: ${from}\r\nTo: ops@zaviya.pk\r\nSubject: Re: Daily report\r\n${date()}Message-ID: <CAG-gmail-1@mail.gmail.com>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="0000alt"\r\n\r\n--0000alt\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nvideo now morning =E2=80=94 please\r\n\r\nOn Fri, 16 Oct 2026 at 20:00, Zaviya Ops <ops@zaviya.pk> wrote:\r\n\r\n> Status: running\r\n> CONFIRM ZZZZZZ\r\n\r\n--0000alt\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<div dir=3D"ltr">video now morning</div>\r\n--0000alt--\r\n`)

export const outlook = () =>
  signed(`${LMTP_HOP}From: =?utf-8?B?V2FsZWVk?= <waleed@zaviya.pk>\r\nTo: ops@zaviya.pk\r\nSubject: =?utf-8?Q?Status_=E2=80=93_please?=\r\n${date()}Message-ID: <OL-1@outlook>\r\nContent-Type: text/html; charset="windows-1252"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<html><body><p>status</p><p>&nbsp;</p><div>From: Zaviya Ops &lt;ops@zaviya.pk&gt;<br>Sent: Friday</div></body></html>\r\n`)

export const iphoneUrdu = () =>
  signed(`${LMTP_HOP}From: Waleed <waleed@zaviya.pk>\r\nTo: ops@zaviya.pk\r\nSubject: =?UTF-8?B?2LTYp9mFINqp24wg2YjbjNqI24zZiA==?=\r\n${date()}Message-ID: <IP-1@me.local>\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('آج کی شام کی ویڈیو نہ لگانا\n\nSent from my iPhone\n\nOn 16 Oct 2026, at 20:00, Zaviya Ops <ops@zaviya.pk> wrote:\n> old').toString('base64')}\r\n`)

export const plain = (body: string, opts: { from?: string; id?: string; subject?: string; unsigned?: boolean; date?: string } = {}) => {
  const raw = `${LMTP_HOP}From: ${opts.from ?? 'waleed@zaviya.pk'}\r\nTo: ops@zaviya.pk\r\nSubject: ${opts.subject ?? 'cmd'}\r\n${opts.date ? `Date: ${opts.date}\r\n` : date()}Message-ID: ${opts.id ?? '<plain-1@x>'}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`
  return opts.unsigned ? raw : signed(raw)
}

/** From: waleed@zaviya.pk typed by an outsider on port 25 (no signature of ours) */
export const spoofedFromOutside = () =>
  `${LMTP_HOP}${OUTSIDE_HOP}From: Waleed <waleed@zaviya.pk>\r\nTo: ops@zaviya.pk\r\nSubject: status\r\n${date()}Message-ID: <spoof@evil>\r\nContent-Type: text/plain\r\n\r\nstatus\r\n`

/** An outsider who copies a real signature header onto their own message */
export const spoofWithPastedSignature = () => {
  const real = plain('status', { id: '<orig@x>' })
  const sig = /DKIM-Signature:[\s\S]*?\r\n(?=From:)/.exec(real)![0]
  return `${LMTP_HOP}${OUTSIDE_HOP}${sig}From: waleed@zaviya.pk\r\nTo: ops@zaviya.pk\r\nSubject: pause\r\n${date()}Message-ID: <spoof2@evil>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\npause\r\n`
}
