import { describe, expect, it } from 'vitest'
import { authenticateSender, MAX_AGE_MS } from './auth.js'
import { parseMail } from './mime.js'
import { gmail, iphoneUrdu, outlook, plain, signed, spoofedFromOutside, spoofWithPastedSignature, TEST_KEY_LOOKUP } from './fixtures.js'

const opts = { allowed: ['waleed@zaviya.pk'], lookup: TEST_KEY_LOOKUP }
const check = (raw: string, o: { allowed?: string[] } = {}) => authenticateSender(raw, parseMail(raw), { ...opts, ...o })

describe('authenticateSender (DKIM of zaviya.pk)', () => {
  it('accepts waleed@ mail signed by our server, from every client shape', async () => {
    for (const raw of [gmail(), outlook(), iphoneUrdu(), plain('status')]) {
      expect(await check(raw)).toEqual({ ok: true, sender: 'waleed@zaviya.pk' })
    }
  })

  it('rejects a spoofed From that arrived from outside (no signature)', async () => {
    expect(await check(spoofedFromOutside())).toMatchObject({ ok: false, reason: 'no DKIM signature' })
  })

  it('rejects a real signature pasted onto a different message', async () => {
    expect(await check(spoofWithPastedSignature())).toMatchObject({ ok: false })
  })

  it('rejects a message changed after signing', async () => {
    expect(await check(plain('status').replace('Subject: cmd', 'Subject: retract 42'))).toMatchObject({ ok: false })
  })

  it('rejects mail signed by another domain', async () => {
    expect(await check(signed(plain('status', { unsigned: true }), 'evil.example'))).toMatchObject({ ok: false })
  })

  it('rejects other mailboxes unless listed, and From with two addresses', async () => {
    expect(await check(plain('status', { from: 'seo@zaviya.pk' }))).toMatchObject({ ok: false, reason: 'sender seo@zaviya.pk is not allowed' })
    expect(await check(plain('status', { from: 'seo@zaviya.pk' }), { allowed: ['waleed@zaviya.pk', 'seo@zaviya.pk'] })).toEqual({ ok: true, sender: 'seo@zaviya.pk' })
    expect((await check(plain('status', { from: 'x@y.pk, waleed@zaviya.pk' }))).ok).toBe(false)
  })

  it('rejects an old signed mail (replay guard)', async () => {
    const raw = plain('pause', { date: new Date(Date.now() - MAX_AGE_MS - 60_000).toUTCString() })
    expect(await check(raw)).toMatchObject({ ok: false, reason: expect.stringContaining('older than') })
  })
})
