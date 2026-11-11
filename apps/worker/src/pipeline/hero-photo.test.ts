import { describe, expect, it, vi } from 'vitest'

vi.mock('./social-card.js', () => ({
  renderSocialCardSet: vi.fn(async () => ({ og: Buffer.from('og'), portrait: Buffer.from('portrait') })),
  categoryAccentColor: () => '#0e7c5a',
}))

vi.mock('./real-photo.js', async (orig) => ({ ...(await orig<typeof import('./real-photo.js')>()), findHeroPhoto: vi.fn(async () => null) }))
vi.mock('./openverse.js', async (orig) => ({ ...(await orig<typeof import('./openverse.js')>()), findOpenversePhoto: vi.fn(async () => null) }))

import { ensureHeroMedia, findHeroImage, heroKindOf, heroMediaMeta } from './hero-photo.js'
import { processPublishJob } from './publish.js'
import type { RealPhoto } from './real-photo.js'

const photo = (over: Partial<RealPhoto['meta']> = {}): RealPhoto => ({
  dataUrl: 'data:image/jpeg;base64,AAAA',
  credit: 'Photo: A / CC BY 2.0',
  bytes: Buffer.alloc(40_000, 3),
  mime: 'image/jpeg',
  meta: { subject: 'Peshawar', file: 'Peshawar street.jpg', author: 'A', licence: 'CC BY 2.0', creditLine: 'Photo: A / CC BY 2.0 / Wikimedia Commons', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Peshawar_street.jpg', mediaCredit: 'x | https://commons.wikimedia.org/wiki/File:Peshawar_street.jpg', width: 2000, height: 1300, provider: 'commons', fromCommons: true, ...over },
})
const ov = (over: Partial<RealPhoto['meta']> = {}) => photo({ subject: 'Pakistan police', file: 'Police on patrol', sourceUrl: 'https://www.flickr.com/photos/1/2', provider: 'openverse', fromCommons: false, ...over })

const input = { title: 'Eleven policemen killed in Kohat attack', tags: ['Kohat'] }

describe('hero order: (a) named subject on Commons, (b) topic photo on Openverse', () => {
  it('(a) wins and Openverse is not asked', async () => {
    const openverse = vi.fn(async () => ov())
    const p = await findHeroImage(input, { commons: async () => photo(), openverse })
    expect(heroKindOf(p!)).toBe('commons')
    expect(openverse).not.toHaveBeenCalled()
  })
  it('(b) when Commons has nothing', async () => {
    const p = await findHeroImage(input, { commons: async () => null, openverse: async (_i, accept) => (accept(ov()) ? ov() : null) })
    expect(heroKindOf(p!)).toBe('openverse')
  })
  it('(b) when Commons throws or returns a document screenshot', async () => {
    const openverse = vi.fn(async (_i: unknown, accept: (p: RealPhoto) => boolean) => (accept(ov()) ? ov() : null))
    expect((await findHeroImage(input, { commons: async () => { throw new Error('boom') }, openverse }))?.meta.provider).toBe('openverse')
    expect((await findHeroImage(input, { commons: async () => photo({ file: 'Kenyataan Akhbar.jpg' }), openverse }))?.meta.provider).toBe('openverse')
  })
  it('the QA applies to Openverse photos too: a screenshot is never used', async () => {
    const p = await findHeroImage(input, { commons: async () => null, openverse: async (_i, accept) => (accept(ov({ file: 'Screenshot of Reddit thread' })) ? ov() : null) })
    expect(p).toBeNull()
  })
  it('null when both fail (the caller uses the branded card)', async () => {
    expect(await findHeroImage(input, { commons: async () => null, openverse: async () => null })).toBeNull()
  })
  it('labels the media: Commons files wikimedia, Flickr stock, never AI', () => {
    expect(heroMediaMeta(photo())).toMatchObject({ license: 'wikimedia', isAiGenerated: false })
    expect(heroMediaMeta(ov())).toMatchObject({ license: 'stock', isAiGenerated: false })
  })
})

describe('ensureHeroMedia (publish guard helper)', () => {
  const upload = () => vi.fn(async (_b: Blob, meta: { filename?: string }) => ({ id: `m-${meta.filename}` }))
  it('uploads the real photo when there is one', async () => {
    const payload = { uploadMedia: upload() }
    const r = await ensureHeroMedia(payload as never, { ...input, category: 'pakistan', slug: 'kohat' }, { commons: async () => null, openverse: async (_i, a) => (a(ov()) ? ov() : null) })
    expect(r).toEqual({ id: 'm-kohat', kind: 'openverse' })
  })
  it('falls to the branded card, labelled own, when no photo exists', async () => {
    const payload = { uploadMedia: upload() }
    const r = await ensureHeroMedia(payload as never, { ...input, category: 'pakistan', slug: 'kohat' }, { commons: async () => null, openverse: async () => null })
    expect(r).toEqual({ id: 'm-kohat-card', kind: 'card' })
    expect(payload.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ license: 'own', isAiGenerated: false, credit: 'Zaviya' }))
  })
  it('card also when the real photo upload fails', async () => {
    const payload = { uploadMedia: vi.fn().mockRejectedValueOnce(new Error('r2 down')).mockResolvedValueOnce({ id: 'c1' }) }
    expect(await ensureHeroMedia(payload as never, { ...input, category: 'pakistan' }, { commons: async () => photo(), openverse: async () => null })).toEqual({ id: 'c1', kind: 'card' })
  })
})

describe('publish never leaves the hero empty', () => {
  const body = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ')
  const write = {
    en: { title: 'Gold price today', slug: 'gold-price-today', dek: 'd', altText: 'alt', imageBrief: 'gold', tags: [], bodyMarkdown: body, whatItMeans: 'It matters.', titleOptions: [], keyPoints: [], faqs: [] },
    promptVersions: { en: 'v1' },
  } as never

  function run(data: object) {
    const payload = {
      getCluster: vi.fn(async () => ({ items: [{ url: 'https://src.example/a', title: 't', source: { name: 's', trustTier: 1 }, publishedAt: new Date().toISOString() }], triage: {} })),
      postArticle: vi.fn(async () => ({ id: 77 })),
      patchCluster: vi.fn(async () => ({})),
      request: vi.fn(async () => ({ docs: [] })),
      uploadMedia: vi.fn(async (_b: Blob, meta: { filename?: string }) => ({ id: `m-${meta.filename}` })),
    }
    const mediaQueue = { add: vi.fn(async () => undefined) }
    return processPublishJob({ clusterId: '1', write, qaScore: 1, priority: 'normal', ...data } as never, { payload: payload as never, socialQueue: { add: vi.fn() } as never, mediaQueue: mediaQueue as never }).catch(() => undefined).then(() => ({ payload, mediaQueue }))
  }

  it('makes a hero (branded card here, no network photo in tests) and queues the photo backfill', async () => {
    const r = await run({})
    const posted = (r.payload.postArticle.mock.calls as unknown as [{ heroMediaId?: string }][])[0]![0]
    expect(posted.heroMediaId).toBe('m-gold-price-today-card')
    expect(r.mediaQueue.add).toHaveBeenCalled()
  })

  it('keeps a hero the media step already made', async () => {
    const r = await run({ heroMediaId: 'm9' })
    expect(((r.payload.postArticle.mock.calls as unknown as [{ heroMediaId?: string }][])[0]![0]).heroMediaId).toBe('m9')
    expect(r.payload.uploadMedia).not.toHaveBeenCalled()
  })
})
