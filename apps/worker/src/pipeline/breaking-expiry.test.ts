import { describe, expect, it } from 'vitest'
import { publisherName } from './publish.js'

// The web-side expiry (apps/web/src/lib/article-flags.ts) is covered by the 24 h rule in docs; here the worker side.
describe('breaking expiry client (ZAV-143)', () => {
  it('PayloadClient.expireBreaking posts to the expiry endpoint', async () => {
    const { PayloadClient } = await import('../payload-client.js')
    const calls: string[] = []
    const client = new PayloadClient('http://x', 'k')
    ;(client as unknown as { request: (m: string, p: string) => Promise<unknown> }).request = async (m, p) => {
      calls.push(`${m} ${p}`)
      return { expired: [874] }
    }
    expect(await client.expireBreaking()).toEqual({ expired: [874] })
    expect(calls).toEqual(['POST /api/pipeline/breaking/expire'])
  })
  it('credits the real outlet for a Trends item without an outlet suffix', () => {
    expect(publisherName('Munir in Tehran', 'Google Trends — Pakistan daily', 'https://www.tasnimnews.com/en/news/1')).toBe('Tasnim News Agency')
  })
})
