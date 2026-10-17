import { readFileSync } from 'node:fs'
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonBody, verifyDkim, type KeyLookup } from './dkim.js'

const raw = readFileSync(new URL('./testdata/real-signed.eml', import.meta.url))
const realKey = readFileSync(new URL('./testdata/zaviya-dkim.txt', import.meta.url), 'utf8')
const lookup: KeyLookup = async (s, d) => (s === 'mail' && d === 'zaviya.pk' ? realKey : null)
const edit = (from: string | RegExp, to: string) => Buffer.from(raw.toString('latin1').replace(from, to), 'latin1')

describe('verifyDkim (a real message signed by mail.zaviya.pk)', () => {
  it('accepts the untouched message', async () => {
    expect(await verifyDkim(raw, 'zaviya.pk', lookup)).toEqual({ ok: true, domain: 'zaviya.pk' })
  })
  it('rejects a changed From (spoofing a signed mail)', async () => {
    expect(await verifyDkim(edit('From: Zaviya SEO <seo@zaviya.pk>', 'From: Zaviya SEO <waleed@zaviya.pk>'), 'zaviya.pk', lookup)).toMatchObject({ ok: false })
  })
  it('rejects a changed subject or body', async () => {
    expect(await verifyDkim(edit('Subject: status', 'Subject: pause'), 'zaviya.pk', lookup)).toMatchObject({ ok: false, reason: 'DKIM signature does not verify' })
    const body = raw.toString('latin1')
    const changed = Buffer.from(body.slice(0, -10) + 'AAAA' + body.slice(-6), 'latin1')
    expect(await verifyDkim(changed, 'zaviya.pk', lookup)).toMatchObject({ ok: false })
  })
  it('rejects a signature made with someone else\'s key (pasted header, attacker DNS)', async () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const p = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
    expect(await verifyDkim(raw, 'zaviya.pk', async () => `v=DKIM1; k=rsa; p=${p}`)).toMatchObject({ ok: false, reason: 'DKIM signature does not verify' })
  })
  it('rejects mail with no signature for our domain', async () => {
    expect(await verifyDkim(edit(/DKIM-Signature:[\s\S]*?(?=\r?\nTo:)/, 'X-Note: none'), 'zaviya.pk', lookup)).toMatchObject({ ok: false, reason: 'no DKIM signature' })
    expect(await verifyDkim(raw, 'evil.example', lookup)).toMatchObject({ ok: false })
  })
})

describe('canonBody', () => {
  it('relaxed: collapses whitespace, drops trailing empty lines', () => {
    expect(canonBody('a  b \t\r\nc\r\n\r\n\r\n', 'relaxed')).toBe('a b\r\nc\r\n')
    expect(canonBody('', 'relaxed')).toBe('')
    expect(canonBody('', 'simple')).toBe('\r\n')
  })
})
