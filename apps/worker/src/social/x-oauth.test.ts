import { describe, it, expect } from 'vitest'
import { oauth1Signature, encodeRFC3986 } from './x-oauth.js'

/** Vector aligned with Twitter OAuth 1.0a signing examples (HMAC-SHA1). */
describe('x-oauth', () => {
  it('RFC3986 encodes special chars', () => {
    expect(encodeRFC3986("Ladies + Gentlemen")).toBe('Ladies%20%2B%20Gentlemen')
  })

  it('produces expected signature for documented base string', () => {
    const sig = oauth1Signature(
      'POST',
      'https://api.twitter.com/1.1/statuses/update.json',
      {
        oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHZsw',
        oauth_nonce: 'kYjzVBBkeY0t8kuRLoo8j+x81qWtBjPjF3J3hJ+Asl2',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1318622958',
        oauth_token: '3705201127-gHcdgJ3R7Z80h4dQWHYXMbwQBgD7xWFr5Fq2',
        oauth_version: '1.0',
        status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
      },
      'L8qq6DcSNAc2mHKhip9fLcNGrSqka8',
      'H7sR6pAZi3rBk3TV8msUk10JGP1E6I0ZSqRIOY6a11',
    )
    // Deterministic HMAC-SHA1 for the Twitter docs parameter set (RFC 3986 encoding).
    expect(sig).toBe('/8bn0QQ5h8sNQMAANHJ/89i8F50=')
  })
})
