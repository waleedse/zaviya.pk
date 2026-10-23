import { existsSync, mkdtempSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LEASE_MS, MediaHub, memoryHubStore, startMediaHubServer } from './media-hub.js'
import type { Server } from 'node:http'

const dir = () => mkdtempSync(path.join(tmpdir(), 'hub-'))

describe('MediaHub', () => {
  it('hands a job to one agent, stores the result and lets the caller read it', async () => {
    const hub = new MediaHub(memoryHubStore(), dir())
    const id = await hub.enqueue('tts', { sentences: ['ایک جملہ۔'] })
    const job = await hub.claim(['tts'], 'mac')
    expect(job?.id).toBe(id)
    expect(await hub.claim(['tts'], 'other')).toBeNull()
    expect(await hub.complete(id, Buffer.from('RIFF'), 'audio/wav', { sentenceMs: [900] })).toBe(true)
    const done = await hub.waitFor(id, 100, 10)
    expect(done?.status).toBe('done')
    expect(hub.readFile(done!)?.toString()).toBe('RIFF')
    expect(done?.meta).toEqual({ sentenceMs: [900] })
  })

  it('enqueues the same id once and serves voice before pictures', async () => {
    const hub = new MediaHub(memoryHubStore(), dir())
    await hub.enqueue('image', { prompt: 'x', width: 512, height: 512, quality: 'fast' }, 'img-aaaaaaaa')
    await hub.enqueue('image', { prompt: 'y', width: 512, height: 512, quality: 'fast' }, 'img-aaaaaaaa')
    const t = await hub.enqueue('tts', { sentences: ['a'] })
    expect((await hub.claim(['tts', 'image'], 'mac'))?.id).toBe(t)
    expect((await hub.claim(['tts', 'image'], 'mac'))?.id).toBe('img-aaaaaaaa')
    expect(await hub.claim(['tts', 'image'], 'mac')).toBeNull()
  })

  it('puts an abandoned job back, and fails it after three tries', async () => {
    let t = 1_000
    const hub = new MediaHub(memoryHubStore(), dir(), () => t)
    const id = await hub.enqueue('image', { prompt: 'x', width: 512, height: 512, quality: 'good' })
    for (let i = 0; i < 3; i++) {
      expect((await hub.claim(['image'], 'mac'))?.id).toBe(id)
      t += LEASE_MS.image + 1
    }
    expect(await hub.claim(['image'], 'mac')).toBeNull()
    expect((await hub.get(id))?.status).toBe('failed')
  })

  it('retries after an agent error', async () => {
    const hub = new MediaHub(memoryHubStore(), dir())
    const id = await hub.enqueue('tts', { sentences: ['a'] })
    await hub.claim(['tts'], 'mac')
    await hub.fail(id, 'out of memory')
    const again = await hub.claim(['tts'], 'mac')
    expect(again?.id).toBe(id)
    expect(again?.attempts).toBe(1)
  })
})

describe('pruneAssets', () => {
  it('deletes old asset files and keeps new ones', async () => {
    const d = dir()
    const hub = new MediaHub(memoryHubStore(), d)
    const ids: string[] = []
    for (const body of ['old', 'new']) {
      const id = await hub.enqueue('tts', { sentences: [body] })
      await hub.claim(['tts'], 'mac')
      await hub.complete(id, Buffer.from(body), 'audio/wav')
      ids.push(id)
    }
    const old = new Date(Date.now() - 10 * 86400_000)
    utimesSync(path.join(d, 'assets', `${ids[0]}.wav`), old, old)
    expect(hub.pruneAssets(7 * 86400_000)).toBe(1)
    expect(existsSync(path.join(d, 'assets', `${ids[0]}.wav`))).toBe(false)
    expect(existsSync(path.join(d, 'assets', `${ids[1]}.wav`))).toBe(true)
  })
})

describe('hub http', () => {
  let server: Server | undefined
  afterEach(() => void server?.close())

  it('refuses a wrong token and serves claim, result and fail', async () => {
    const hub = new MediaHub(memoryHubStore(), dir())
    server = startMediaHubServer(hub, { port: 0, token: 'secret-token', host: '127.0.0.1' })
    await new Promise((r) => server!.once('listening', r))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const auth = { Authorization: 'Bearer secret-token', 'content-type': 'application/json' }

    expect((await fetch(`${base}/claim`, { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' })).status).toBe(401)
    expect((await fetch(`${base}/claim`, { method: 'POST', headers: auth, body: JSON.stringify({ waitSec: 0 }) })).status).toBe(204)

    const id = await hub.enqueue('tts', { sentences: ['ہاں۔'] })
    const claimed = await fetch(`${base}/claim`, { method: 'POST', headers: auth, body: JSON.stringify({ kinds: ['tts'], waitSec: 0 }) })
    expect(((await claimed.json()) as { id: string }).id).toBe(id)
    const put = await fetch(`${base}/result/${id}`, { method: 'PUT', headers: { Authorization: 'Bearer secret-token', 'content-type': 'audio/wav', 'x-meta': '{"a":1}' }, body: new Uint8Array([1, 2, 3]) })
    expect(put.status).toBe(200)
    expect((await hub.get(id))?.status).toBe('done')
    expect((await fetch(`${base}/result/${id}`, { method: 'PUT', headers: auth, body: 'x' })).status).toBe(409)
  })
})
