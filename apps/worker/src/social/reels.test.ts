import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { postInstagramReel, setReelSleep } from './reels.js'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const UPLOAD_400 = '{"debug_info":{"retriable":false,"type":"ProcessingFailedError","message":"Request processing failed"}}'

describe('postInstagramReel (ZAV-180)', () => {
  let file = ''
  beforeEach(async () => {
    file = path.join(await mkdtemp(path.join(tmpdir(), 'reel-')), 'v.mp4')
    await writeFile(file, Buffer.from('not really a video'))
    setReelSleep(async () => {})
  })
  afterEach(() => vi.unstubAllGlobals())

  const run = (statuses: unknown[], upload: () => Response) => {
    let polls = 0
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { method?: string }) => {
        calls.push(`${init?.method ?? 'GET'} ${String(url).split('?')[0]}`)
        if (String(url).includes('rupload')) return upload()
        if (String(url).endsWith('/media')) return json({ id: 'C1', uri: 'https://rupload.facebook.com/ig-api-upload/C1' })
        if (String(url).endsWith('/media_publish')) return json({ id: 'M1' })
        return json(statuses[Math.min(polls++, statuses.length - 1)])
      }),
    )
    return { calls, result: postInstagramReel({ file, caption: 'c' }, { igUserId: 'IG', token: 't' }) }
  }

  it('publishes when the upload answers 400 but the container finishes', async () => {
    const r = run([{ status_code: 'IN_PROGRESS' }, { status_code: 'IN_PROGRESS' }, { status_code: 'FINISHED' }], () => new Response(UPLOAD_400, { status: 400 }))
    expect(await r.result).toEqual({ ok: true, id: 'M1' })
    expect(r.calls.some((c) => c.endsWith('/media_publish'))).toBe(true)
  })

  it('reports Meta\'s status text and the upload error when the container ends in ERROR', async () => {
    const r = run([{ status_code: 'ERROR', status: 'Error: video codec not supported' }], () => new Response(UPLOAD_400, { status: 400 }))
    const out = await r.result
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/video codec not supported/)
    expect(out.error).toMatch(/upload HTTP 400/)
    expect(r.calls.some((c) => c.endsWith('/media_publish'))).toBe(false)
  })

  it('abandons a container that stays IN_PROGRESS and publishes the next one that finishes', async () => {
    const created: string[] = []
    let polls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.includes('rupload')) return new Response(UPLOAD_400, { status: 400 })
        if (u.endsWith('/media')) {
          created.push(`C${created.length + 1}`)
          return json({ id: created.at(-1), uri: 'https://rupload.facebook.com/ig-api-upload/x' })
        }
        if (u.endsWith('/media_publish')) return json({ id: 'M1' })
        // the first container never finishes (18 polls); the second finishes at its first poll
        return json(created.length < 2 ? { status_code: 'IN_PROGRESS' } : { status_code: 'FINISHED' })
      }),
    )
    void polls
    expect(await postInstagramReel({ file, caption: 'c' }, { igUserId: 'IG', token: 't' })).toEqual({ ok: true, id: 'M1' })
    expect(created).toEqual(['C1', 'C2'])
  })

  it('gives up after six containers and reports the last upload error', async () => {
    const r = run([{ status_code: 'IN_PROGRESS' }], () => new Response(UPLOAD_400, { status: 400 }))
    const out = await r.result
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/after 6 containers/)
    expect(out.error).toMatch(/upload HTTP 400/)
    expect(r.calls.filter((c) => c.endsWith('/media') && c.startsWith('POST')).length).toBe(6)
  })

  it('does not retry a refused container request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: 'no permission', code: 10 } })))
    const out = await postInstagramReel({ file, caption: 'c' }, { igUserId: 'IG', token: 't' })
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/code 10/)
  })

  it('keeps a plain 200 upload working', async () => {
    const r = run([{ status_code: 'FINISHED' }], () => json({ success: true }))
    expect(await r.result).toEqual({ ok: true, id: 'M1' })
  })

})
