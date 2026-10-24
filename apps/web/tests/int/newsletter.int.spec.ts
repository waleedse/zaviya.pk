import { describe, expect, it } from 'vitest'
import { ipHash, newToken, normalizeEmail } from '@/lib/newsletter'

describe('newsletter helpers', () => {
  it('normalizes and validates emails', () => {
    expect(normalizeEmail('  Reader@Example.COM ')).toBe('reader@example.com')
    expect(normalizeEmail('no-at-sign')).toBeNull()
    expect(normalizeEmail('a@b')).toBeNull()
    expect(normalizeEmail('a b@example.com')).toBeNull()
    expect(normalizeEmail(`${'a'.repeat(250)}@example.com`)).toBeNull()
  })

  it('makes unguessable url-safe tokens', () => {
    const a = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(newToken()).not.toBe(a)
  })

  it('hashes the ip instead of keeping it', () => {
    expect(ipHash('1.2.3.4')).toBe(ipHash('1.2.3.4'))
    expect(ipHash('1.2.3.4')).not.toContain('1.2.3.4')
    expect(ipHash('1.2.3.4')).not.toBe(ipHash('1.2.3.5'))
  })
})
