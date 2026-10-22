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

  it('keeps a plain 200 upload working', async () => {
    const r = run([{ status_code: 'FINISHED' }], () => json({ success: true }))
    expect(await r.result).toEqual({ ok: true, id: 'M1' })
  })

  it('does not publish a container that never finishes, and says how long it waited', async () => {
    const r = run([{ status_code: 'IN_PROGRESS' }], () => new Response(UPLOAD_400, { status: 400 }))
    const out = await r.result
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/timed out after 8 min/)
  })
})
