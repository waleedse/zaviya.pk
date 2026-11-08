import { describe, expect, it, vi } from 'vitest'
import { HERO_BACKFILL_JOB, backfillRealPhotos, queueHeroBackfill } from './hero-backfill.js'
import type { PayloadClient } from '../payload-client.js'

function fakePayload(docs: unknown[]) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const payload = {
    request: vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body })
      return method === 'GET' ? { docs } : {}
    }),
  } as unknown as PayloadClient
  return { payload, calls }
}

const docs = [
  { id: 1, title: 'Real image', heroImage: { id: 10, isAiGenerated: true } },
  { id: 2, title: 'Text card', dek: 'Dek two', heroImage: { id: 11, isAiGenerated: false } },
  { id: 3, title: 'No image', heroImage: null },
]

describe('queueHeroBackfill', () => {
  it('queues stories without a real image and keeps them online', async () => {
    const { payload, calls } = fakePayload(docs)
    const add = vi.fn(async () => undefined)
    const res = await queueHeroBackfill(payload, { add } as never)
    expect(res.ids).toEqual(['2', '3'])
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    expect(add).toHaveBeenCalledWith(
      HERO_BACKFILL_JOB,
      { articleId: '2', title: 'Text card', brief: 'Text card. Dek two', sourceUrls: [] },
      expect.anything(),
    )
  })

  it('changes nothing on a dry run', async () => {
    const { payload, calls } = fakePayload(docs)
    const add = vi.fn()
    const res = await queueHeroBackfill(payload, { add } as never, { dryRun: true })
    expect(res.ids).toEqual(['2', '3'])
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    expect(add).not.toHaveBeenCalled()
  })
})

describe('backfillRealPhotos', () => {
  const photo = { dataUrl: 'x', credit: 'c', bytes: Buffer.alloc(30_000), mime: 'image/jpeg', meta: { subject: 's', file: 'f.jpg', author: 'a', licence: 'CC0', creditLine: 'Photo: a / CC0 / Wikimedia Commons', sourceUrl: 'https://commons.wikimedia.org/wiki/File:f.jpg', mediaCredit: 'Photo: a / CC0 / Wikimedia Commons | https://commons.wikimedia.org/wiki/File:f.jpg' } }

  function setup(find: (i: { title: string }) => Promise<unknown>) {
    const calls: { method: string; path: string; body?: unknown }[] = []
    const payload = {
      request: vi.fn(async (method: string, path: string, body?: unknown) => {
        calls.push({ method, path, body })
        if (path.startsWith('/api/articles?')) {
          return {
            docs: [
              { id: 1, title: 'Quiet AI story', heroImage: { id: 10, isAiGenerated: true } },
              { id: 2, title: 'Midterms: Democrats take Congress', heroImage: { id: 11, isAiGenerated: true } },
              { id: 3, title: 'Real photo already', heroImage: { id: 12, isAiGenerated: false } },
            ],
          }
        }
        if (path.startsWith('/api/metrics-daily')) return { docs: [{ article: 2, pageviews: 500 }, { article: { id: 1 }, pageviews: 5 }] }
        return {}
      }),
      uploadMedia: vi.fn(async () => ({ id: '99' })),
    }
    return { payload: payload as unknown as PayloadClient, raw: payload, calls, find: vi.fn(find) }
  }

  it('replaces AI heroes with real photos, most viewed first, keeps the old media and counts', async () => {
    const t = setup(async (i) => (i.title.startsWith('Midterms') ? photo : null))
    const res = await backfillRealPhotos(t.payload, { find: t.find as never, pauseMs: 0 })
    expect(res).toMatchObject({ scanned: 3, aiHeroes: 2, replaced: 1, noPhoto: 1, failed: 0 })
    expect(res.items.map((i) => i.id)).toEqual(['2', '1'])
    expect(t.raw.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ license: 'wikimedia', isAiGenerated: false, credit: photo.meta.mediaCredit }))
    const patches = t.calls.filter((c) => c.method === 'PATCH')
    expect(patches).toEqual([{ method: 'PATCH', path: '/api/articles/2?locale=en', body: { heroImage: 99 } }])
    expect(t.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('changes nothing on a dry run', async () => {
    const t = setup(async () => photo)
    const res = await backfillRealPhotos(t.payload, { dryRun: true, find: t.find as never, pauseMs: 0 })
    expect(res.replaced).toBe(0)
    expect(t.find).not.toHaveBeenCalled()
    expect(t.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })
})
