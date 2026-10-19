import { describe, expect, it } from 'vitest'
import { fromHeader } from '../../../ops/bin/mail-header.mjs'

describe('mail From header', () => {
  it('quotes the display name so a comma stays inside it', () => {
    expect(fromHeader('Waleed, Zaviya News', undefined, 'contact@zaviya.pk')).toBe('"Waleed, Zaviya News" <contact@zaviya.pk>')
  })
  it('keeps the Zaviya prefix only when the name lacks it', () => {
    expect(fromHeader('SEO', undefined, 'seo@zaviya.pk')).toBe('"Zaviya SEO" <seo@zaviya.pk>')
    expect(fromHeader('Zaviya News', undefined, 'a@zaviya.pk')).toBe('"Zaviya News" <a@zaviya.pk>')
  })
  it('escapes quotes and backslashes', () => {
    expect(fromHeader('Say "hi" \\ there', undefined, 'a@zaviya.pk')).toBe('"Zaviya Say \\"hi\\" \\\\ there" <a@zaviya.pk>')
  })
  it('encodes a non-ASCII name as an RFC 2047 word', () => {
    expect(fromHeader(undefined, 'Waleed · Zaviya News', 'a@zaviya.pk')).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <a@zaviya\.pk>$/)
  })
  it('uses --from-name as given', () => {
    expect(fromHeader('News', 'Waleed, Zaviya News', 'a@zaviya.pk')).toBe('"Waleed, Zaviya News" <a@zaviya.pk>')
  })
})
