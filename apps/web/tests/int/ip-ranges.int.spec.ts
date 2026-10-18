import { describe, expect, it } from 'vitest'
import { ipInRanges, isMetaIp, parseCidr } from '@/lib/ip-ranges'

describe('ip ranges', () => {
  it('matches IPv4 and IPv6 CIDRs', () => {
    const r = [parseCidr('31.13.64.0/18')!, parseCidr('2a03:2880::/32')!]
    expect(ipInRanges('31.13.100.7', r)).toBe(true)
    expect(ipInRanges('31.13.128.1', r)).toBe(false)
    expect(ipInRanges('2a03:2880:f12f:83::1', r)).toBe(true)
    expect(ipInRanges('2a03:2881::1', r)).toBe(false)
    expect(ipInRanges('not-an-ip', r)).toBe(false)
  })
  it('knows Meta addresses and leaves Pakistani users alone', () => {
    expect(isMetaIp('2a03:2880:f12f:83:face:b00c:0:25de')).toBe(true)
    expect(isMetaIp('39.32.10.20')).toBe(false) // PTCL, Pakistan
    expect(isMetaIp('194.163.184.12')).toBe(false) // our own server
    expect(isMetaIp('')).toBe(false)
  })
})
