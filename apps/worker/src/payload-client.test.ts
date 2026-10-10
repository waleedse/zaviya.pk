import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PayloadClient } from './payload-client.js'

describe('PayloadClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends API-Key authorization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ sources: [] }), { status: 200 }))
    const client = new PayloadClient('http://localhost:3000', 'secret-key')
    await client.getSources()
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/pipeline/sources',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'users API-Key secret-key' }),
      }),
    )
  })
})
