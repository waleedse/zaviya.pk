import { beforeEach, describe, expect, it, vi } from 'vitest'

const photo = {
  dataUrl: 'data:image/jpeg;base64,AAAA',
  credit: 'Photo: A / CC BY 2.0 / Wikimedia Commons',
  bytes: Buffer.alloc(90_000),
  mime: 'image/jpeg',
  meta: { subject: 'Elon Musk', file: 'Musk.jpg', author: 'A', licence: 'CC BY 2.0', creditLine: '', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Musk.jpg', mediaCredit: 'Photo: A | https://commons.wikimedia.org/wiki/File:Musk.jpg', width: 2000, height: 1500 },
}

const found = vi.hoisted(() => ({ photo: null as unknown }))
vi.mock('../pipeline/real-photo.js', async (orig) => ({
  ...(await orig<typeof import('../pipeline/real-photo.js')>()),
  findPhotoForSubjects: vi.fn(async (subjects: string[]) => (found.photo ? { ...(found.photo as object), meta: { ...(found.photo as { meta: object }).meta, subject: subjects[0] } } : null)),
  livingPeople: vi.fn(async (s: string[]) => new Set(s)),
}))
vi.mock('../pipeline/quote-card.js', () => ({ renderQuoteCard: vi.fn(async () => Buffer.from('png')) }))
const posts = vi.hoisted(() => ({ fb: vi.fn(), ig: vi.fn(), x: vi.fn() }))
vi.mock('./facebook.js', () => ({ postFacebook: posts.fb }))
vi.mock('./instagram.js', () => ({ postInstagram: posts.ig }))
vi.mock('./x.js', () => ({ postX: posts.x }))

import { processQuoteJob, queueArticleQuotes, runQuoteRound, watchSearches, withTags, type QuoteDeps } from './quote-post.js'

function fakeRedis() {
  const kv = new Map<string, string>()
  const lists = new Map<string, string[]>()
  return {
    kv,
    lists,
    get: async (k: string) => kv.get(k) ?? null,
    set: async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && kv.has(k)) return null
      kv.set(k, v)
      return 'OK'
    },
    del: async (...ks: string[]) => {
      let n = 0
      for (const k of ks) n += kv.delete(k) ? 1 : 0
      return n
    },
    incr: async (k: string) => {
      const n = Number(kv.get(k) ?? 0) + 1
      kv.set(k, String(n))
      return n
    },
    expire: async () => 1,
    lpush: async (k: string, v: string) => {
      const l = lists.get(k) ?? []
      l.unshift(v)
      lists.set(k, l)
      return l.length
    },
    ltrim: async (k: string, a: number, b: number) => {
      lists.set(k, (lists.get(k) ?? []).slice(a, b + 1))
      return 'OK'
    },
    lrange: async (k: string, a: number, b: number) => (lists.get(k) ?? []).slice(a, b + 1),
  }
}

const NOW = Date.parse('2026-11-11T09:00:00Z') // 14:00 PKT
const musk = { id: '1', author: 'elonmusk', text: 'The future of AI will be decided by who builds the most compute and uses it well.', url: 'https://x.com/elonmusk/status/1', createdAt: new Date(NOW - 20 * 60_000).toISOString(), mediaUrls: [] }

function deps(over: Partial<QuoteDeps> & { posts?: unknown[] } = {}) {
  const redis = fakeRedis()
  const sent: { name: string; data: any; opts: any }[] = []
  const bridge = { isOnline: () => true, send: vi.fn(async () => ({ posts: over.posts ?? [musk] })) }
  const payload = {
    uploadMedia: vi.fn(async () => ({ id: 'm1', url: '/api/media/file/quote-elon-musk-abc-post.png' })),
    internalLinks: vi.fn(async (): Promise<{ links: { title: string; url: string }[] }> => ({ links: [] })),
    getSettings: vi.fn(async () => ({})),
    getSocialCount: vi.fn(async () => ({ counts: {}, lastPostedAt: {} })),
  }
  const d = {
    env: { CHROMIUM_PATH: '/x', PAYLOAD_URL: 'https://zaviya.pk', PUBLIC_MEDIA_URL: undefined, MEDIA_CDN_URL: undefined } as never,
    payload: payload as never,
    bridge: bridge as never,
    redis: redis as never,
    now: () => NOW,
    pauseMs: [0, 0] as [number, number],
    socialQueue: { add: vi.fn(async (name: string, data: unknown, opts?: unknown) => void sent.push({ name, data, opts }) as unknown) },
    ...over,
  }
  // the scan rotates through the watch-list: start at the group that holds @elonmusk
  redis.kv.set('zaviya:quote:rotation', String(watchSearches().findIndex((g) => g.people.some((p) => p.handle === 'elonmusk'))))
  return { d: d as QuoteDeps & { socialQueue: typeof d.socialQueue }, redis, sent, bridge, payload }
}

beforeEach(() => {
  found.photo = photo
  posts.fb.mockReset()
  posts.ig.mockReset()
  posts.x.mockReset()
})

describe('watch-list search', () => {
  it('builds from: queries in groups, with min_faves, no replies or retweets', () => {
    const s = watchSearches()
    expect(s.length).toBeGreaterThan(2)
    expect(s[0]!.query).toMatch(/^\(from:\w+( OR from:\w+)*\) -filter:replies -filter:nativeretweets min_faves:\d+$/)
    expect(s.flatMap((x) => x.people.map((p) => p.handle))).toContain('MaryamNSharif')
    expect(s.flatMap((x) => x.people.map((p) => p.handle))).toContain('elonmusk')
  })
})

describe('quote round', () => {
  it('turns a watch-list post into a queued card: real photo, source kept, idempotent', async () => {
    const { d, sent, redis } = deps()
    const r = await runQuoteRound(d)
    expect(r.queued).toBeTruthy()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.name).toBe('quote')
    expect(sent[0]!.data.sourceUrl).toBe('https://x.com/elonmusk/status/1')
    expect(sent[0]!.data.copy.facebook).toContain('Source: @elonmusk on X')
    expect(sent[0]!.data.copy.facebook).toContain('“' + musk.text + '”')
    expect(sent[0]!.data.mediaUrls[0]).toMatch(/-post\.png$/)
    expect(sent[0]!.data.url).toBeUndefined()
    // same quote again (after the first card is out): not queued twice
    await redis.del('zaviya:quote:inflight')
    const again = await runQuoteRound(d)
    expect(again.queued).toBeUndefined()
    expect(sent).toHaveLength(1)
  })

  it('no photo, no card (and the quote stays free for a later try)', async () => {
    found.photo = null
    const { d, sent, redis } = deps()
    const r = await runQuoteRound(d)
    expect(r.queued).toBeUndefined()
    expect(sent).toHaveLength(0)
    expect([...redis.kv.keys()].some((k) => k.startsWith('zaviya:quote:done:'))).toBe(false)
  })

  it('skips an unsafe quote', async () => {
    const { d, sent } = deps({ posts: [{ ...musk, text: 'Those clowns in the opposition are a disgrace to the whole nation and the world.' }] })
    expect((await runQuoteRound(d)).queued).toBeUndefined()
    expect(sent).toHaveLength(0)
  })

  it('links the related Zaviya story when one exists', async () => {
    const { d, sent, payload } = deps()
    payload.internalLinks.mockResolvedValueOnce({ links: [{ title: 'Elon Musk unveils new AI chip', url: 'https://zaviya.pk/ai/musk-chip' }] })
    await runQuoteRound(d)
    expect(sent[0]!.data.url).toBe('https://zaviya.pk/ai/musk-chip')
    expect(sent[0]!.data.copy.facebook).not.toContain('x.com/elonmusk')
  })

  it('uses direct quotes from published stories (speaker must be a known person)', async () => {
    const { d, sent, redis } = deps({ posts: [] })
    await queueArticleQuotes(
      redis as never,
      [{ title: 'AI boom', url: 'https://dawn.com/a', contentText: 'Speaking in Dubai, Sam Altman said: “We expect compute to become the scarcest resource in the world by next year.”', publishedAt: new Date(NOW - 3600_000).toISOString(), source: { name: 'Dawn', trustTier: 1 } }],
      { category: 'ai', slug: 'ai-boom' },
    )
    const r = await runQuoteRound(d)
    expect(r.queued).toBeTruthy()
    expect(sent[0]!.data.sourceUrl).toBe('https://dawn.com/a')
    expect(sent[0]!.data.url).toBe('https://zaviya.pk/ai/ai-boom')
    expect(sent[0]!.data.copy.facebook).toContain('Source: Dawn')
  })
})

describe('quote post job', () => {
  const data = {
    id: 'q1',
    copy: { facebook: 'f', instagram: 'i', x: 'x' },
    mediaUrls: ['https://zaviya.pk/api/media/file/q-post.png'],
    speaker: 'Elon Musk',
    sourceUrl: 'https://x.com/elonmusk/status/1',
    sourceLabel: '@elonmusk on X',
    quote: 'q',
    queuedAt: NOW,
  }
  const succeed = (platform: string) => async (_i: unknown, dep: { payload: { upsertSocialPost: (b: unknown) => Promise<unknown> } }) => {
    await dep.payload.upsertSocialPost({ status: 'posted', externalId: `${platform}1`, copy: 'c' })
  }

  it('posts to all three platforms, counts one card, logs it, and is idempotent per platform', async () => {
    posts.fb.mockImplementation(succeed('fb'))
    posts.ig.mockImplementation(succeed('ig'))
    posts.x.mockImplementation(succeed('x'))
    const { d, redis } = deps()
    expect(await processQuoteJob(data, d)).toEqual({ posted: ['facebook', 'instagram', 'x'] })
    expect(redis.kv.get('zaviya:quote:day:2026-11-11')).toBe('1')
    expect(redis.lists.get('zaviya:quote:log')).toHaveLength(3)
    // a retry of the same job does not post again on any platform: it is past its slot, so it waits an hour first
    const retry = await processQuoteJob(data, { ...d, now: () => NOW + 2 * 3600_000 })
    expect(retry).toEqual({ skipped: 'nothing was posted' })
    expect(posts.fb).toHaveBeenCalledTimes(1)
    expect(posts.x).toHaveBeenCalledTimes(1)
  })

  it('waits 60 minutes after the last card', async () => {
    const { d, redis } = deps()
    redis.kv.set('zaviya:quote:last', String(NOW - 10 * 60_000))
    expect(await processQuoteJob(data, d)).toMatchObject({ delayUntil: NOW + 50 * 60_000, reason: 'spacing' })
    expect(posts.fb).not.toHaveBeenCalled()
  })

  it('does not post in the quiet hours (00:00-08:00 PKT)', async () => {
    const { d } = deps({ now: () => Date.parse('2026-11-10T22:30:00Z') }) // 03:30 PKT
    expect(await processQuoteJob(data, d)).toMatchObject({ delayUntil: Date.parse('2026-11-11T03:00:00Z') })
  })

  it('stops at six cards a day', async () => {
    const { d, redis } = deps()
    redis.kv.set('zaviya:quote:day:2026-11-11', '6')
    expect(await processQuoteJob(data, d)).toMatchObject({ skipped: expect.stringContaining('cap') })
    expect(posts.fb).not.toHaveBeenCalled()
  })

  it('respects a platform whose own daily cap is used up', async () => {
    posts.fb.mockImplementation(succeed('fb'))
    posts.x.mockImplementation(succeed('x'))
    const { d, payload } = deps()
    payload.getSocialCount.mockResolvedValue({ counts: { instagram: 5 }, lastPostedAt: {} })
    expect(await processQuoteJob(data, d)).toEqual({ posted: ['facebook', 'x'] })
    expect(posts.ig).not.toHaveBeenCalled()
  })
})

describe('hashtags and trend words on quote cards', () => {
  it('adds at most three hashtags and the trend as words, without touching the quote', () => {
    const copy = { facebook: 'F “q”', instagram: 'I “q”', x: 'X “q”' }
    const out = withTags(copy, { speaker: 'Elon Musk', category: 'tech-telecom', quote: 'Starship launch next week' }, ['Starship launch'])
    expect(out.facebook).toContain('Trending: Starship launch')
    expect(out.facebook.startsWith('F “q”')).toBe(true)
    expect(out.instagram.match(/#\w+/g)!.length).toBeLessThanOrEqual(3)
  })
})
