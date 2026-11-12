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

describe('backfillRealPhotos (AI, missing and document heroes)', () => {
  const photo = (provider: 'commons' | 'openverse') => ({
    dataUrl: 'x',
    credit: 'c',
    bytes: Buffer.alloc(30_000),
    mime: 'image/jpeg',
    meta: { subject: 's', file: 'f.jpg', author: 'a', licence: 'CC0', creditLine: 'Photo: a / CC0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:f.jpg', mediaCredit: 'Photo: a / CC0 | https://commons.wikimedia.org/wiki/File:f.jpg', provider, fromCommons: provider === 'commons' },
  })

  const articles = [
    { id: 1, title: 'Quiet AI story', category: { slug: 'pakistan' }, heroImage: { id: 10, isAiGenerated: true, license: 'ai-generated' } },
    { id: 2, title: 'Midterms: Democrats take Congress', heroImage: { id: 11, isAiGenerated: true } },
    { id: 3, title: 'Real photo already', heroImage: { id: 12, isAiGenerated: false, license: 'wikimedia', filename: 'peshawar-street.jpg', credit: 'Photo: a / CC0 | https://commons.wikimedia.org/wiki/File:Street.jpg' } },
    { id: 4, title: 'No hero at all', heroImage: null },
    { id: 5, title: 'Malaysian press release page', heroImage: { id: 13, isAiGenerated: false, license: 'wikimedia', filename: 'kenyataan-akhbar-2025.jpg', credit: 'Photo: x / CC0' } },
    { id: 6, title: 'Branded card already', heroImage: { id: 14, isAiGenerated: false, license: 'own', credit: 'Zaviya' } },
  ]

  function setup(find: (i: { title: string }) => Promise<unknown>) {
    const calls: { method: string; path: string; body?: unknown }[] = []
    const payload = {
      request: vi.fn(async (method: string, path: string, body?: unknown) => {
        calls.push({ method, path, body })
        if (path.startsWith('/api/articles?')) return { docs: articles }
        if (path.startsWith('/api/metrics-daily')) return { docs: [{ article: 2, pageviews: 500 }, { article: { id: 1 }, pageviews: 5 }] }
        return {}
      }),
      uploadMedia: vi.fn(async () => ({ id: '99' })),
    }
    const card = vi.fn(async () => ({ id: '77' }))
    return { payload: payload as unknown as PayloadClient, raw: payload, calls, find: vi.fn(find), card }
  }

  it('fixes AI, missing and document heroes (most viewed first), upgrades a card only when a photo exists, keeps old media, counts', async () => {
    // Midterms -> Commons, "No hero" -> Openverse, the rest: no photo
    const t = setup(async (i) => (i.title.startsWith('Midterms') ? photo('commons') : i.title.startsWith('No hero') ? photo('openverse') : null))
    const res = await backfillRealPhotos(t.payload, { find: t.find as never, pauseMs: 0, card: t.card as never })
    expect(res).toMatchObject({ scanned: 6, candidates: 5, replacedCommons: 1, replacedOpenverse: 1, brandedCard: 2, unchanged: 2, failed: 0 })
    expect(res.noPhoto.sort()).toEqual(['Branded card already', 'Malaysian press release page', 'Quiet AI story'].sort())
    expect(res.items.filter((i) => i.problem).map((i) => `${i.id}:${i.problem}:${i.status}`)).toEqual(['2:ai:commons', '1:ai:card', '4:missing:openverse', '5:document:card', '6:card:unchanged'])
    const patches = t.calls.filter((c) => c.method === 'PATCH')
    expect(patches.map((p) => p.path)).toEqual(['/api/articles/2?locale=en', '/api/articles/1?locale=en', '/api/articles/4?locale=en', '/api/articles/5?locale=en'])
    expect(patches[0]?.body).toEqual({ heroImage: 99 })
    expect(patches[1]?.body).toEqual({ heroImage: 77 })
    expect(t.card).toHaveBeenCalledTimes(2)
    expect(t.raw.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ license: 'wikimedia', isAiGenerated: false }))
    expect(t.raw.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ license: 'stock', isAiGenerated: false }))
    expect(t.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('finds a document hero by its pixels when the name looks fine', async () => {
    const { PNG } = await import('pngjs')
    const page = new PNG({ width: 200, height: 280 })
    page.data.fill(255)
    const bytes = PNG.sync.write(page)
    const t = setup(async () => null)
    const res = await backfillRealPhotos(t.payload, { find: t.find as never, pauseMs: 0, card: t.card as never, fetchImage: async (m) => (m.id === 12 ? { bytes, mime: 'image/png' } : null) })
    expect(res.items.find((i) => i.id === '3')).toMatchObject({ problem: 'document', status: 'card' })
  })

  it('changes nothing on a dry run', async () => {
    const t = setup(async () => photo('commons'))
    const res = await backfillRealPhotos(t.payload, { dryRun: true, find: t.find as never, pauseMs: 0, card: t.card as never })
    expect(res.candidates).toBe(5)
    expect(res.replacedCommons + res.replacedOpenverse + res.brandedCard).toBe(0)
    expect(t.find).not.toHaveBeenCalled()
    expect(t.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })
})

describe('hero sweep (missing heroes only)', () => {
  it('touches only published stories with no hero and gives them a branded card when no photo exists', async () => {
    const calls: { method: string; path: string; body?: unknown }[] = []
    const payload = {
      request: vi.fn(async (method: string, path: string, body?: unknown) => {
        calls.push({ method, path, body })
        if (path.startsWith('/api/articles?')) {
          return { docs: [{ id: 1, title: 'Has AI hero', heroImage: { id: 10, isAiGenerated: true } }, { id: 2, title: 'Released by the editor', heroImage: null }, { id: 3, title: 'Fine', heroImage: { id: 12, license: 'wikimedia', credit: 'Photo: a / CC0' } }] }
        }
        return { docs: [] }
      }),
      uploadMedia: vi.fn(async () => ({ id: '99' })),
    }
    const card = vi.fn(async () => ({ id: '77' }))
    const res = await backfillRealPhotos(payload as unknown as PayloadClient, { only: ['missing'], find: async () => null, card: card as never, pauseMs: 0 })
    expect(res).toMatchObject({ candidates: 1, brandedCard: 1, failed: 0 })
    expect(calls.filter((c) => c.method === 'PATCH')).toEqual([{ method: 'PATCH', path: '/api/articles/2?locale=en', body: { heroImage: 77 } }])
  })
})
