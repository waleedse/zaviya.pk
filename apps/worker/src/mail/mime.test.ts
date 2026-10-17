import { describe, expect, it } from 'vitest'
import { decodeWords, parseMail, singleAddress, trimQuoted } from './mime.js'
import { gmail, iphoneUrdu, outlook } from './fixtures.js'

describe('parseMail', () => {
  it('Gmail: reads the quoted-printable text part and drops the quoted history', () => {
    const m = parseMail(gmail())
    expect(m.text).toBe('video now morning — please')
    expect(m.text).not.toContain('CONFIRM')
    expect(m.subject).toBe('Re: Daily report')
    expect(m.messageId).toBe('<CAG-gmail-1@mail.gmail.com>')
    expect(m.fromAddress).toBe('waleed@zaviya.pk')
  })

  it('Outlook: HTML only, encoded subject, From: block trimmed', () => {
    const m = parseMail(outlook())
    expect(m.text).toBe('status')
    expect(m.subject).toBe('Status – please')
  })

  it('iPhone: base64 Urdu, signature and attribution removed', () => {
    const m = parseMail(iphoneUrdu())
    expect(m.text).toBe('آج کی شام کی ویڈیو نہ لگانا')
    expect(m.subject).toBe('شام کی ویڈیو')
  })

  it('keeps every Received line in order, topmost first', () => {
    const rec = parseMail(gmail()).headers.filter((h) => h.name === 'received')
    expect(rec).toHaveLength(2)
    expect(rec[0]!.value).toContain('LMTP')
  })
})

describe('helpers', () => {
  it('joins adjacent encoded words', () => {
    expect(decodeWords('=?UTF-8?B?SGVs?= =?UTF-8?B?bG8=?=')).toBe('Hello')
  })
  it('singleAddress needs exactly one address', () => {
    expect(singleAddress('Waleed <Waleed@Zaviya.pk>')).toBe('waleed@zaviya.pk')
    expect(singleAddress('waleed@zaviya.pk')).toBe('waleed@zaviya.pk')
    expect(singleAddress('A <a@x.pk>, B <waleed@zaviya.pk>')).toBeNull()
    expect(singleAddress('nobody')).toBeNull()
  })
  it('trims a wrapped Gmail attribution', () => {
    expect(trimQuoted('go\n\nOn Sat, 17 Oct 2026 at 10:00, Some Very Long Name <x@y.com>\nwrote:\n> hi')).toBe('go')
  })
})
