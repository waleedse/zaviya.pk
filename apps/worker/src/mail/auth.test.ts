import { describe, expect, it } from 'vitest'
import { authenticateSender } from './auth.js'
import { parseMail } from './mime.js'
import { AUTH_HOP, gmail, plain, spoofedFromOutside, spoofWithForgedHopBelow } from './fixtures.js'

const opts = { host: 'mail.zaviya.pk', allowed: ['waleed@zaviya.pk'] }
const check = (raw: string, o = opts) => authenticateSender(parseMail(raw), o)

describe('authenticateSender', () => {
  it('accepts waleed@ submitted with authentication through our server (LMTP hop on top is skipped)', () => {
    expect(check(gmail())).toEqual({ ok: true, sender: 'waleed@zaviya.pk' })
  })

  it('rejects a spoofed From that arrived from outside', () => {
    const r = check(spoofedFromOutside())
    expect(r.ok).toBe(false)
  })

  it('rejects a spoof that forges an authenticated hop lower in the header chain', () => {
    expect(check(spoofWithForgedHopBelow()).ok).toBe(false)
  })

  it('rejects another zaviya mailbox even when authenticated as itself', () => {
    const r = check(plain('status', { from: 'seo@zaviya.pk', hop: AUTH_HOP('seo@zaviya.pk') }))
    expect(r).toMatchObject({ ok: false })
  })

  it('rejects waleed@ in From when a different account authenticated', () => {
    const r = check(plain('status', { hop: AUTH_HOP('seo@zaviya.pk') }))
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('authenticated as seo@zaviya.pk') })
  })

  it('rejects a From with two addresses and a missing Received chain', () => {
    expect(check(plain('status', { from: 'x@y.pk, waleed@zaviya.pk' })).ok).toBe(false)
    expect(check('From: waleed@zaviya.pk\r\nSubject: s\r\n\r\nstatus\r\n').ok).toBe(false)
  })

  it('the test allow-list accepts seo@ only when listed AND authenticated as seo@', () => {
    const o = { ...opts, allowed: ['waleed@zaviya.pk', 'seo@zaviya.pk'] }
    const raw = plain('status', { from: 'seo@zaviya.pk', hop: AUTH_HOP('seo@zaviya.pk') })
    expect(check(raw, o)).toEqual({ ok: true, sender: 'seo@zaviya.pk' })
    expect(check(raw).ok).toBe(false)
  })
})
