import { describe, expect, it, vi } from 'vitest'
import { makeExplainerImage, photoPrompt, PORTRAIT, startExplainerImageWorker } from './gemini-images.js'
import { MediaHub, memoryHubStore, startMediaHubServer } from '../media-hub.js'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const offline = { isOnline: () => false, send: vi.fn() } as never

describe('photoPrompt', () => {
  it('writes a vertical photograph brief that keeps text, logos, flags and faces out', () => {
    const p = photoPrompt('A smartphone on a wooden desk, warm light.')
    expect(p).toMatch(/Photorealistic vertical 9:16 photograph/)
    expect(p).toMatch(/no text/i)
    expect(p).toMatch(/no logos/i)
    expect(p).toMatch(/No flags/)
    expect(p).toMatch(/No recognisable faces/)
  })
})

describe('makeExplainerImage', () => {
  it('falls back to a portrait FLUX picture when the extension is offline', async () => {
    const seen: { url: string; form?: FormData }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), form: init?.body instanceof FormData ? init.body : undefined })
      return new Response(JSON.stringify({ result: { image: Buffer.from('JPEGDATA').toString('base64') } }))
    }) as unknown as typeof fetch
    const made = await makeExplainerImage({ bridge: offline, accountId: 'acc', aiToken: 'tok', fetchImpl }, 'A telescope on a hill at dusk', 'x1')
    expect(made?.source).toBe('flux')
    expect(made?.blob.size).toBeGreaterThan(0)
    const form = seen[0]!.form!
    expect(form.get('width')).toBe(String(PORTRAIT.width))
    expect(form.get('height')).toBe(String(PORTRAIT.height))
    expect(String(form.get('prompt'))).toMatch(/Photorealistic vertical/)
  })

  it('returns null when neither source works', async () => {
    expect(await makeExplainerImage({ bridge: offline }, 'A scene', 'x2')).toBeNull()
  })
})

describe('explainer image worker', () => {
  it('claims a gemini job from the hub and delivers the picture', async () => {
    const hub = new MediaHub(memoryHubStore(), mkdtempSync(path.join(tmpdir(), 'gi-')))
    const server = startMediaHubServer(hub, { port: 0, token: 'tok', host: '127.0.0.1' })
    await new Promise((r) => server.once('listening', r))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const id = await hub.enqueue('gemini', { prompt: 'A lighthouse at night', width: 1080, height: 1920 })
    let stop = false
    const fetchImpl = (async () => new Response(JSON.stringify({ result: { image: Buffer.from('PNGDATA').toString('base64') } }))) as unknown as typeof fetch
    // the worker talks to the real hub over HTTP; only the picture service is faked
    const realFetch = globalThis.fetch
    startExplainerImageWorker({ hubUrl: url, token: 'tok', deps: { bridge: offline, accountId: 'a', aiToken: 't', fetchImpl }, stop: () => stop, fetchImpl: realFetch })
    const done = await hub.waitFor(id, 10_000, 50)
    stop = true
    server.close()
    expect(done?.status).toBe('done')
    expect(hub.readFile(done!)?.length).toBeGreaterThan(0)
    expect(done?.meta).toEqual({ model: 'flux' })
  })
})
