/** Raw messages shaped like what mail.zaviya.pk stores (Postfix + Dovecot) for the three main clients */
const AUTH_HOP = (who: string) =>
  `Received: from [192.0.2.55] (unknown [192.0.2.55])\r\n\t(Authenticated sender: ${who})\r\n\tby mail.zaviya.pk (Postfix) with ESMTPSA id 4F2A1B3C4D\r\n\tfor <ops@zaviya.pk>; Sat, 17 Oct 2026 10:00:01 +0500 (PKT)\r\n`
const LMTP_HOP = `Received: from mail.zaviya.pk\r\n\tby mail.zaviya.pk with LMTP id aBcD1234\r\n\tfor <ops@zaviya.pk>; Sat, 17 Oct 2026 10:00:02 +0500\r\n`
const OUTSIDE_HOP = `Received: from evil.example (evil.example [203.0.113.9])\r\n\tby mail.zaviya.pk (Postfix) with ESMTPS id 99ZZ\r\n\tfor <ops@zaviya.pk>; Sat, 17 Oct 2026 10:00:01 +0500 (PKT)\r\n`

export const gmail = (from = 'Waleed <waleed@zaviya.pk>', hop = AUTH_HOP('waleed@zaviya.pk')) =>
  `${LMTP_HOP}Return-Path: <waleed@zaviya.pk>\r\n${hop}From: ${from}\r\nTo: ops@zaviya.pk\r\nSubject: Re: Daily report\r\nMessage-ID: <CAG-gmail-1@mail.gmail.com>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="0000alt"\r\n\r\n--0000alt\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nvideo now morning =E2=80=94 please\r\n\r\nOn Fri, 16 Oct 2026 at 20:00, Zaviya Ops <ops@zaviya.pk> wrote:\r\n\r\n> Status: running\r\n> CONFIRM ZZZZZZ\r\n\r\n--0000alt\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<div dir=3D"ltr">video now morning</div>\r\n--0000alt--\r\n`

export const outlook = () =>
  `${LMTP_HOP}${AUTH_HOP('waleed@zaviya.pk')}From: =?utf-8?B?V2FsZWVk?= <waleed@zaviya.pk>\r\nTo: ops@zaviya.pk\r\nSubject: =?utf-8?Q?Status_=E2=80=93_please?=\r\nMessage-ID: <OL-1@outlook>\r\nContent-Type: text/html; charset="windows-1252"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<html><body><p>status</p><p>&nbsp;</p><div>From: Zaviya Ops &lt;ops@zaviya.pk&gt;<br>Sent: Friday</div></body></html>\r\n`

export const iphoneUrdu = () =>
  `${LMTP_HOP}${AUTH_HOP('waleed@zaviya.pk')}From: Waleed <waleed@zaviya.pk>\r\nTo: ops@zaviya.pk\r\nSubject: =?UTF-8?B?2LTYp9mFINqp24wg2YjbjNqI24zZiA==?=\r\nMessage-ID: <IP-1@me.local>\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('آج کی شام کی ویڈیو نہ لگانا\n\nSent from my iPhone\n\nOn 16 Oct 2026, at 20:00, Zaviya Ops <ops@zaviya.pk> wrote:\n> old').toString('base64')}\r\n`

export const plain = (body: string, opts: { from?: string; hop?: string; id?: string; subject?: string } = {}) =>
  `${LMTP_HOP}${opts.hop ?? AUTH_HOP('waleed@zaviya.pk')}From: ${opts.from ?? 'waleed@zaviya.pk'}\r\nTo: ops@zaviya.pk\r\nSubject: ${opts.subject ?? 'cmd'}\r\nMessage-ID: ${opts.id ?? '<plain-1@x>'}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`

/** From: waleed@zaviya.pk typed by an outsider on port 25 */
export const spoofedFromOutside = () => `${LMTP_HOP}${OUTSIDE_HOP}From: Waleed <waleed@zaviya.pk>\r\nTo: ops@zaviya.pk\r\nSubject: status\r\nMessage-ID: <spoof@evil>\r\nContent-Type: text/plain\r\n\r\nstatus\r\n`

/** Spoof that also forges an "Authenticated sender" line further down, below our own hop */
export const spoofWithForgedHopBelow = () =>
  `${LMTP_HOP}${OUTSIDE_HOP}${AUTH_HOP('waleed@zaviya.pk')}From: Waleed <waleed@zaviya.pk>\r\nTo: ops@zaviya.pk\r\nSubject: status\r\nMessage-ID: <spoof2@evil>\r\nContent-Type: text/plain\r\n\r\nstatus\r\n`

export { AUTH_HOP }
