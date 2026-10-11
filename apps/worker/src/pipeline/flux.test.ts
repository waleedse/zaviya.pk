import { describe, expect, it } from 'vitest'
import { fluxPrompt, generateHeroViaWorkersAI } from './flux.js'

describe('Workers AI fallback image', () => {
  it('asks for a realistic photo without text or real faces', () => {
    const p = fluxPrompt('Petrol pump in Lahore with a long queue of motorbikes')
    expect(p).toMatch(/Photorealistic/)
    expect(p).toMatch(/No text/)
    expect(p).toMatch(/recognisable faces/)
  })

  it('returns null without credentials and decodes the image otherwise', async () => {
    expect(await generateHeroViaWorkersAI('x', { clusterId: '1' })).toBeNull()
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ success: true, result: { image: Buffer.from('jpeg-bytes').toString('base64') } }), { status: 200 })) as typeof fetch
    const blob = await generateHeroViaWorkersAI('x', { clusterId: '1', accountId: 'a', token: 't', fetchImpl: fakeFetch })
    expect(blob?.type).toBe('image/jpeg')
    expect(Buffer.from(await blob!.arrayBuffer()).toString()).toBe('jpeg-bytes')
  })
})
