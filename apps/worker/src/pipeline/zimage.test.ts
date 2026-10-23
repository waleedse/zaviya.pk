import { describe, expect, it } from 'vitest'
import { generateViaZImage } from './zimage.js'

describe('Z-Image Turbo', () => {
  it('does nothing without a key', async () => {
    expect(await generateViaZImage('x', { clusterId: '1' })).toBeNull()
  })

  it('posts the prompt with 8 steps, then downloads the picture', async () => {
    const calls: { url: string; body?: string; auth?: string }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as string | undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization })
      return String(url).includes('fal.run')
        ? new Response(JSON.stringify({ images: [{ url: 'https://v3.fal.media/files/a.jpg' }] }))
        : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    }) as unknown as typeof fetch
    const blob = await generateViaZImage('a flow diagram', { key: 'k', clusterId: '1', fetchImpl })
    expect(blob?.size).toBe(3)
    expect(calls[0]!.auth).toBe('Key k')
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({ prompt: 'a flow diagram', num_inference_steps: 8, output_format: 'jpeg' })
  })

  it('returns null when the service errors', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ detail: 'no credit' }), { status: 403 })) as unknown as typeof fetch
    expect(await generateViaZImage('x', { key: 'k', clusterId: '1', fetchImpl })).toBeNull()
  })
})
