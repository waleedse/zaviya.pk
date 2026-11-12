import { describe, expect, it } from 'vitest'
import { BISP, OFFICIAL_LINKS, REGISTRATION_GUIDES } from '../../src/lib/bisp-8171'

describe('BISP 8171 page data (ZG-19)', () => {
  it('links only to official BISP, NADRA registry or PMDU hosts, over https', () => {
    const hosts = [...Object.values(OFFICIAL_LINKS), ...REGISTRATION_GUIDES].map((l) => new URL(l.url))
    for (const u of hosts) {
      expect(u.protocol).toBe('https:')
      expect(u.hostname).toMatch(/(^|\.)(bisp\.gov\.pk|nadra\.gov\.pk|citizenportal\.gov\.pk)$/)
    }
  })
  it('the CNIC portal is the official 8171 host and the helpline is the one bisp.gov.pk shows', () => {
    expect(new URL(OFFICIAL_LINKS.portal.url).hostname).toBe(BISP.portalHost)
    expect(BISP.helpline).toBe('0800-26477')
  })
})
