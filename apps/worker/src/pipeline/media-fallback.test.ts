import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./social-card.js', () => ({
  renderSocialCardSet: vi.fn(async () => ({ og: Buffer.from('og'), portrait: Buffer.from('portrait') })),
  categoryAccentColor: () => '#0e7c5a',
  photoDataUrl: vi.fn(async () => null),
}))
vi.mock('./post-card.js', () => ({ renderPostCard: vi.fn(async () => null) }))
vi.mock('./real-photo.js', async (orig) => ({ ...(await orig<typeof import('./real-photo.js')>()), findRealPhoto: vi.fn(async () => null), findHeroPhoto: vi.fn(async () => null) }))
vi.mock('./reference.js', () => ({ describeReferenceScene: vi.fn(async () => null) }))
vi.mock('./flux.js', () => ({ generateHeroViaWorkersAI: vi.fn(async () => null), fluxPrompt: (b: string) => b }))
vi.mock('./zimage.js', () => ({ generateViaZImage: vi.fn(async () => null) }))

import { heroMaxTries, processMediaJob } from './media.js'
import * as realPhoto from './real-photo.js'
import * as socialCard from './social-card.js'
import { HERO_BACKFILL_JOB, processHeroBackfill } from './hero-backfill.js'
import { processPublishJob } from './publish.js'

const write = {
  en: { title: 'Gold price today', slug: 'gold-price-today', dek: 'd', altText: 'alt', imageBrief: 'gold bars', tags: [] },
} as never

const env = { REQUIRE_HERO_IMAGE: true, HERO_IMAGE_MAX_TRIES: 8, EDITOR_GATE: false, IMAGE_SOURCE: 'gemini', PAYLOAD_URL: 'http://x' } as never
const offline = { isOnline: () => false, send: vi.fn() }

function deps() {
  const payload = {
    getCluster: vi.fn(async () => ({ items: [], triage: { category: 'pakistan' } })),
    uploadMedia: vi.fn(async (_b: Blob, meta: { filename?: string }) => ({ id: `m-${meta.filename}`, url: `/api/media/file/${meta.filename}.png` })),
  }
  return { payload, publishQueue: { add: vi.fn() }, mediaQueue: { add: vi.fn() } }
}

// The Gemini queue spaces attempts 30 s apart (module state shared by the tests below), so time is faked for the whole file
beforeAll(() => vi.useFakeTimers())
afterAll(() => vi.useRealTimers())
beforeEach(() => vi.clearAllMocks())

describe('heroMaxTries', () => {
  it('cuts breaking news short', () => {
    expect(heroMaxTries('breaking', 8)).toBe(2)
    expect(heroMaxTries('normal', 8)).toBe(8)
    expect(heroMaxTries('breaking', 1)).toBe(1)
  })
})

describe('processMediaJob without a Gemini image (ZAV-299)', () => {
  it('holds the story while tries remain', async () => {
    const d = deps()
    await processMediaJob({ clusterId: '1', write, qaScore: 1, priority: 'normal', imageTries: 2 }, { ...d, env, bridge: offline } as never)
    expect(d.mediaQueue.add).toHaveBeenCalledOnce()
    expect(d.publishQueue.add).not.toHaveBeenCalled()
  })

  it('publishes with the branded card, flagged heroFallback, after the last try', async () => {
    const d = deps()
    await processMediaJob({ clusterId: '1', write, qaScore: 1, priority: 'normal', imageTries: 7 }, { ...d, env, bridge: offline } as never)
    expect(d.mediaQueue.add).not.toHaveBeenCalled()
    expect(d.publishQueue.add).toHaveBeenCalledOnce()
    const job = d.publishQueue.add.mock.calls[0][1]
    expect(job.heroFallback).toBe(true)
    expect(job.heroMediaId).toBe('m-gold-price-today-card')
  })

  it('breaking news falls back after the second try', async () => {
    const d = deps()
    await processMediaJob({ clusterId: '1', write, qaScore: 1, priority: 'breaking', imageTries: 1 }, { ...d, env, bridge: offline } as never)
    expect(d.publishQueue.add.mock.calls[0][1].heroFallback).toBe(true)
  })

  it('a Gemini image publishes without the fallback flag', async () => {
    const d = deps()
    const bridge = { isOnline: () => true, send: vi.fn(async () => ({ base64: Buffer.alloc(200, 1).toString('base64'), mimeType: 'image/png', width: 1, height: 1 })) }
    await processMediaJob({ clusterId: '1', write, qaScore: 1, priority: 'normal' }, { ...d, env, bridge } as never)
    const job = d.publishQueue.add.mock.calls[0][1]
    expect(job.heroFallback).toBeUndefined()
    expect(job.heroMediaId).toBe('m-gold-price-today')
  })
})

describe('fallback story gets its real hero later', () => {
  const body = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ')
  const full = { en: { ...(write as never as { en: object }).en, bodyMarkdown: body, whatItMeans: 'It matters.', titleOptions: [], keyPoints: [], faqs: [] }, promptVersions: { en: 'v1' } } as never

  it('queues a backfill for the published article', async () => {
    const mediaQueue = { add: vi.fn() }
    const payload = {
      getCluster: vi.fn(async () => ({ items: [{ url: 'https://src.example/a', title: 't', source: { name: 's', trustTier: 1 }, publishedAt: new Date().toISOString() }], triage: {} })),
      postArticle: vi.fn(async () => ({ id: 77 })),
      patchCluster: vi.fn(async () => ({})),
      request: vi.fn(async () => ({ docs: [] })),
    }
    await processPublishJob(
      { clusterId: '1', write: full, qaScore: 1, priority: 'normal', heroMediaId: 'm1', heroFallback: true },
      { payload: payload as never, socialQueue: { add: vi.fn() } as never, mediaQueue: mediaQueue as never },
    ).catch(() => undefined)
    expect(mediaQueue.add).toHaveBeenCalledWith(
      HERO_BACKFILL_JOB,
      expect.objectContaining({ articleId: '77', title: 'Gold price today', brief: 'gold bars', sourceUrls: ['https://src.example/a'] }),
      expect.anything(),
    )
  })

  it('backfill replaces the hero in place when Gemini is back', async () => {
    const payload = {
      uploadMedia: vi.fn(async () => ({ id: '99' })),
      request: vi.fn(async () => ({})),
    }
    const bridge = { isOnline: () => true, send: vi.fn(async () => ({ base64: Buffer.alloc(200, 1).toString('base64'), mimeType: 'image/png', width: 1, height: 1 })) }
    const run = processHeroBackfill(
      { articleId: '77', title: 'Gold price today', brief: 'gold bars' },
      { payload: payload as never, env: { HERO_IMAGE_MAX_TRIES: 8 } as never, mediaQueue: { add: vi.fn() } as never, bridge },
    )
    await vi.advanceTimersByTimeAsync(60_000)
    await run
    expect(payload.request).toHaveBeenCalledWith('PATCH', '/api/articles/77?locale=en', { heroImage: 99 })
  })
})

describe('real photo first, AI only as a last resort', () => {
  const meta = { subject: 'United States Capitol', file: 'US Capitol east side.JPG', author: 'Martin Falbisoner', licence: 'CC BY-SA 3.0', creditLine: 'Photo: Martin Falbisoner / CC BY-SA 3.0 / Wikimedia Commons', sourceUrl: 'https://commons.wikimedia.org/wiki/File:US_Capitol_east_side.JPG', mediaCredit: 'Photo: Martin Falbisoner / CC BY-SA 3.0 / Wikimedia Commons | https://commons.wikimedia.org/wiki/File:US_Capitol_east_side.JPG' }
  const photo = { dataUrl: 'data:image/jpeg;base64,AAAA', credit: meta.creditLine, bytes: Buffer.alloc(30_000, 1), mime: 'image/jpeg', meta }

  it('uses a Commons photo as the hero with its credit, never calls Gemini, and puts it on the social cards', async () => {
    vi.mocked(realPhoto.findHeroPhoto).mockResolvedValueOnce(photo)
    const d = deps()
    const bridge = { isOnline: () => true, send: vi.fn() }
    const capitolStory = { en: { ...(write as { en: object }).en, title: 'Democrats take Congress in the midterms' } } as never
    await processMediaJob({ clusterId: '1', write: capitolStory, qaScore: 1, priority: 'normal' }, { ...d, env, bridge } as never)
    expect(bridge.send).not.toHaveBeenCalled()
    expect(d.payload.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ license: 'wikimedia', isAiGenerated: false, credit: meta.mediaCredit }))
    expect(d.publishQueue.add.mock.calls[0][1].heroFallback).toBeUndefined()
    expect(vi.mocked(socialCard.renderSocialCardSet).mock.calls[0]![0]).toMatchObject({ photo: photo.dataUrl })
  })

  it('keeps a hero the headline does not name off the social card and uses a person-first photo of who it names', async () => {
    const huang = { ...photo, dataUrl: 'data:image/jpeg;base64,HUANG', meta: { ...meta, subject: 'Jensen Huang', licence: 'CC BY 2.0', width: 2000, height: 1300 } }
    const building = { ...photo, meta: { ...meta, subject: 'Nvidia' } }
    vi.mocked(realPhoto.findHeroPhoto).mockResolvedValueOnce(building)
    vi.mocked(realPhoto.findRealPhoto).mockResolvedValueOnce(huang)
    const d = deps()
    const story = { en: { title: 'Jensen Huang admits affair probe', slug: 'huang', dek: 'd', altText: 'alt', imageBrief: 'x', tags: ['Jensen Huang', 'Nvidia'] } } as never
    await processMediaJob({ clusterId: '1', write: story, qaScore: 1, priority: 'normal' }, { ...d, env, bridge: { isOnline: () => true, send: vi.fn() } } as never)
    expect(vi.mocked(socialCard.renderSocialCardSet).mock.calls[0]![0]).toMatchObject({ photo: 'data:image/jpeg;base64,HUANG' })
  })

  it('an AI hero is labelled and never reaches the social cards', async () => {
    const d = deps()
    const bridge = { isOnline: () => true, send: vi.fn(async () => ({ base64: Buffer.alloc(200, 1).toString('base64'), mimeType: 'image/png', width: 1, height: 1 })) }
    await processMediaJob({ clusterId: '1', write, qaScore: 1, priority: 'normal' }, { ...d, env, bridge } as never)
    expect(d.payload.uploadMedia).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ license: 'ai-generated', isAiGenerated: true, credit: 'Zaviya (AI illustration)' }))
    expect(vi.mocked(socialCard.renderSocialCardSet).mock.calls[0]![0]).toMatchObject({ photo: null })
  })
})
