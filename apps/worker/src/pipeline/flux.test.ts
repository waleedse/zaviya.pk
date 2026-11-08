import { describe, expect, it } from 'vitest'
import { fluxPrompt, generateHeroViaWorkersAI } from './flux.js'
import { extractOgImage } from './reference.js'

describe('Workers AI hero image', () => {
  it('asks only for a generic illustration: no real people, events, buildings, countries or text', () => {
    const p = fluxPrompt('US midterm elections: Democrats take the House', 'A grand chamber with rows of seats.')
    expect(p).toMatch(/illustration, not a photograph/)
    expect(p).toMatch(/Do not depict real, named or recognisable people, real events, elections/)
    expect(p).toMatch(/specific real building, landmark, chamber or palace/)
    expect(p).toMatch(/never place the scene in Pakistan unless the theme names Pakistan/)
    expect(p).toMatch(/no text/i)
    // the scene description of the real event no longer steers the image, and no Pakistan or documentary bias remains
    expect(p).not.toMatch(/grand chamber/)
    expect(p).not.toMatch(/setting in Pakistan where relevant|documentary style|Photorealistic/)
  })

  it('returns null without credentials, falls back from FLUX.2 to schnell', async () => {
    expect(await generateHeroViaWorkersAI('x', { clusterId: '1' })).toBeNull()
    const calls: string[] = []
    const fakeFetch = (async (url: string) => {
      calls.push(url)
      if (url.includes('flux-2')) return new Response(JSON.stringify({ success: false, errors: [{ code: 3030 }] }), { status: 400 })
      return new Response(JSON.stringify({ success: true, result: { image: Buffer.from('jpeg-bytes').toString('base64') } }), { status: 200 })
    }) as typeof fetch
    const blob = await generateHeroViaWorkersAI('x', { clusterId: '1', accountId: 'a', token: 't', fetchImpl: fakeFetch })
    expect(calls.map((u) => u.split('/').pop())).toEqual(['flux-2-klein-9b', 'flux-1-schnell'])
    expect(Buffer.from(await blob!.arrayBuffer()).toString()).toBe('jpeg-bytes')
  })
})

describe('reference photo', () => {
  it('reads og:image in either attribute order and resolves relative URLs', () => {
    expect(extractOgImage('<meta property="og:image" content="/img/a.jpg">', 'https://geo.tv/news/1')).toBe('https://geo.tv/img/a.jpg')
    expect(extractOgImage('<meta content="https://x.pk/b.jpg?a=1&amp;b=2" property="og:image">', 'https://x.pk')).toBe('https://x.pk/b.jpg?a=1&b=2')
    expect(extractOgImage('<meta name="twitter:image" content="https://t.pk/c.png">', 'https://t.pk')).toBe('https://t.pk/c.png')
    expect(extractOgImage('<title>none</title>', 'https://t.pk')).toBeNull()
  })
})
