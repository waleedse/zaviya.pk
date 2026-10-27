import { describe, expect, it } from 'vitest'
import { atlIdKind, atlSmsText } from '../../src/lib/atl-check'

describe('ATL SMS text', () => {
  it('builds the FBR format for a CNIC with or without dashes', () => {
    expect(atlSmsText('35202-1234567-1')).toBe('ATL 3520212345671')
    expect(atlSmsText('3520212345671')).toBe('ATL 3520212345671')
  })
  it('accepts a 7-digit NTN', () => {
    expect(atlIdKind('1234567')).toBe('ntn')
    expect(atlSmsText('1234567')).toBe('ATL 1234567')
  })
  it('rejects other lengths', () => {
    expect(atlSmsText('12345')).toBe('')
    expect(atlIdKind('')).toBe('invalid')
  })
})
