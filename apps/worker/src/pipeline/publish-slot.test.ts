import { describe, it, expect, vi } from 'vitest'
import { processPublishJob, acquirePublishSlot, releasePublishSlot } from './publish.js'

const body = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ')
const write = {
  en: {
    title: 'T', titleOptions: [], slug: 's', dek: 'd', keyPoints: ['k'], bodyMarkdown: body, whatItMeans: 'It matters.', tags: [], faqs: [],
    socialCopy: { facebook: '', instagram: '', x: '' },
  },
  promptVersions: { en: 'v1' },
}

/** Minimal Redis: SET NX PX, GET, EVAL (compare-and-delete) */
function fakeRedis() {
  const store = new Map<string, string>()
  return {
    set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return null
      store.set(k, v)
      return 'OK'
    }),
    eval: vi.fn(async (_s: string, _n: number, k: string, v: string) => (store.get(k) === v ? (store.delete(k), 1) : 0)),
    store,
  }
}

describe('publish slot', () => {
  it('two concurrent jobs with one free slot publish only one', async () => {
    const redis = fakeRedis()
    let published = 0
    let lastPublishedAt: string | null = null
    const payload = {
      getCluster: vi.fn(async () => ({ items: [], triage: { category: 'pakistan' } })),
      getSettings: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5))
        return { articlesPublishedToday: published, lastPublishedAt, minIntervalMin: 10, dailyCaps: { articles: 100 } }
      }),
      postArticle: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10))
        published++
        lastPublishedAt = new Date().toISOString()
        return { id: String(published) }
      }),
      patchCluster: vi.fn(async () => ({})),
      request: vi.fn(async () => ({ docs: [] })),
    }
    const publishQueue = { add: vi.fn(async () => ({})) }
    const deps = { payload: payload as never, socialQueue: { add: vi.fn() } as never, publishQueue: publishQueue as never, redis: redis as never }
    const job = () => processPublishJob({ clusterId: '1', write: write as never, qaScore: 1, priority: 'normal' }, deps)

    const [a, b] = await Promise.all([job(), job()])
    expect(payload.postArticle).toHaveBeenCalledTimes(1)
    expect([a, b].filter(Boolean)).toHaveLength(1)
    // the loser is re-queued, within 30-90 s, and the lock is released
    expect(publishQueue.add).toHaveBeenCalledTimes(1)
    const opts = (publishQueue.add.mock.calls[0] as unknown[])[2] as { delay: number }
    expect(opts.delay).toBeGreaterThanOrEqual(30_000)
    expect(opts.delay).toBeLessThan(90_000)
    expect(redis.store.size).toBe(0)
  })

  it('breaking stories do not take the slot', async () => {
    const redis = fakeRedis()
    redis.store.set('publish:slot', 'someone-else')
    const payload = {
      getCluster: vi.fn(async () => ({ items: [], triage: {} })),
      getSettings: vi.fn(),
      postArticle: vi.fn(async () => ({ id: '1' })),
      patchCluster: vi.fn(async () => ({})),
    }
    const res = await processPublishJob(
      { clusterId: '1', write: write as never, qaScore: 1, priority: 'breaking' },
      { payload: payload as never, socialQueue: { add: vi.fn() } as never, publishQueue: { add: vi.fn() } as never, redis: redis as never },
    )
    expect(res).toEqual({ articleId: '1' })
    expect(redis.store.get('publish:slot')).toBe('someone-else')
  })

  it('release only deletes the lock the caller owns', async () => {
    const redis = fakeRedis()
    const token = await acquirePublishSlot(redis as never)
    expect(token).toBeTruthy()
    expect(await acquirePublishSlot(redis as never)).toBeNull()
    await releasePublishSlot(redis as never, 'not-mine')
    expect(redis.store.size).toBe(1)
    await releasePublishSlot(redis as never, token!)
    expect(redis.store.size).toBe(0)
  })
})

describe('stale social cards', () => {
  const setup = () => {
    const payload = {
      getCluster: vi.fn(async () => ({ items: [], triage: { category: 'pakistan' } })),
      getSettings: vi.fn(async () => ({ articlesPublishedToday: 0, lastPublishedAt: null, minIntervalMin: 0, dailyCaps: { articles: 100 } })),
      postArticle: vi.fn(async () => ({ id: '7' })),
      patchCluster: vi.fn(async () => ({})),
      request: vi.fn(async () => ({ docs: [] })),
    }
    const socialQueue = { add: vi.fn(async () => ({})) }
    const rerenderCards = vi.fn(async () => ['https://x/new-post.png'])
    return { payload, socialQueue, rerenderCards }
  }
  const urls = (q: { add: ReturnType<typeof vi.fn> }) => q.add.mock.calls.map((c) => (c[1] as { mediaUrls: string[] }).mediaUrls)

  it('remakes cards made before the current card version', async () => {
    const { payload, socialQueue, rerenderCards } = setup()
    await processPublishJob(
      { clusterId: '1', write: write as never, qaScore: 1, priority: 'breaking', socialMediaUrls: ['https://x/old-post.png'] },
      { payload: payload as never, socialQueue: socialQueue as never, rerenderCards },
    )
    expect(rerenderCards).toHaveBeenCalledOnce()
    expect(urls(socialQueue)).toEqual([['https://x/new-post.png'], ['https://x/new-post.png'], ['https://x/new-post.png']])
  })

  it('keeps current cards, and keeps old cards when the remake fails', async () => {
    const a = setup()
    await processPublishJob(
      { clusterId: '1', write: write as never, qaScore: 1, priority: 'breaking', socialMediaUrls: ['https://x/cur.png'], cardVersion: 99 },
      { payload: a.payload as never, socialQueue: a.socialQueue as never, rerenderCards: a.rerenderCards },
    )
    expect(a.rerenderCards).not.toHaveBeenCalled()
    expect(urls(a.socialQueue)[0]).toEqual(['https://x/cur.png'])

    const b = setup()
    b.rerenderCards.mockRejectedValueOnce(new Error('chromium down'))
    await processPublishJob(
      { clusterId: '1', write: write as never, qaScore: 1, priority: 'breaking', socialMediaUrls: ['https://x/old.png'] },
      { payload: b.payload as never, socialQueue: b.socialQueue as never, rerenderCards: b.rerenderCards },
    )
    expect(urls(b.socialQueue)[0]).toEqual(['https://x/old.png'])
  })
})
