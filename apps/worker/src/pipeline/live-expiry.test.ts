import { describe, expect, it } from 'vitest'

describe('live expiry client (ZAV-214)', () => {
  it('PayloadClient.expireLive posts to the live expiry endpoint', async () => {
    const { PayloadClient } = await import('../payload-client.js')
    const calls: string[] = []
    const client = new PayloadClient('http://x', 'k')
    ;(client as unknown as { request: (m: string, p: string) => Promise<unknown> }).request = async (m, p) => {
      calls.push(`${m} ${p}`)
      return { expired: [1759] }
    }
    expect(await client.expireLive()).toEqual({ expired: [1759] })
    expect(calls).toEqual(['POST /api/pipeline/live/expire'])
  })
})
