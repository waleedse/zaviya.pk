import { mkdtempSync, existsSync, readFileSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sha1Hex } from '../lib/idempotency.js'
import type { VideoConfig } from './config.js'
import { cleanOld, runEdition, type JobDeps, type RedisLike } from './job.js'
import type { ApiArticle } from './lib.js'
import { parseSlots } from './schedule.js'

const NOW = Date.UTC(2026, 9, 17, 2, 40, 5) // 07:40 PKT
const [morning] = parseSlots(undefined)

function fakeRedis(): RedisLike & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(k) {
      return store.get(k) ?? null
    },
    async set(k, v, ...args) {
      if (args.includes('NX') && store.has(k)) return null
      store.set(k, v)
      return 'OK'
    },
  }
}

const cats = ['pakistan', 'business', 'world', 'cricket', 'tech-telecom', 'ai']
function article(i: number): ApiArticle {
  return {
    id: 100 + i,
    title: `Distinct story ${i} alpha${i} bravo${i} charlie${i} delta${i}`,
    dek: 'A standfirst.',
    slug: `s${i}`,
    category: { slug: cats[i % cats.length]! },
    tags: [{ name: 'State Bank of Pakistan' }],
    heroImage: { url: `https://example.test/${i}.jpg` },
    sources: [{ name: 'Dawn', tier: 2 }],
    priority: 'normal',
    publishedAt: new Date(NOW - i * 600_000).toISOString(),
  }
}
const rates = [
  { series: 'usd_interbank', value: 277, unit: 'PKR', source: 'x', observedAt: new Date(NOW - 3600_000).toISOString() },
  { series: 'petrol_super', value: 386.3, unit: 'PKR/L', source: 'y', observedAt: new Date(NOW - 3600_000).toISOString() },
]

let dir: string
function setup(over: Partial<JobDeps> = {}, cfgOver: Partial<VideoConfig> = {}) {
  const redis = fakeRedis()
  const upserts: Record<string, unknown>[] = []
  const posts: string[] = []
  const deps: JobDeps = {
    cfg: { enabled: true, slots: parseSlots(undefined), platforms: ['instagram', 'facebook'], vetoMin: 20, flash: false, trendReel: false, dataDir: dir, bundleDir: '/none', concurrency: 1, siteUrl: 'https://zaviya.pk', keepDays: 14, ...cfgOver },
    redis,
    payload: { upsertSocialPost: vi.fn(async (b) => void upserts.push(b)) },
    fetchArticles: vi.fn(async () => Array.from({ length: 8 }, (_, i) => article(i))),
    fetchRates: vi.fn(async () => rates),
    fetchTrends: vi.fn(async () => []),
    prepareImage: vi.fn(async (_u, _d, id) => `${id}.jpg`),
    render: vi.fn(async ({ outDir }) => {
      const mp4 = path.join(outDir, 'video.mp4')
      writeFileSync(mp4, 'x')
      return { mp4, cover: path.join(outDir, 'cover.png'), durationMs: 1234 }
    }),
    telegram: { sendPreview: vi.fn(async () => {}), notify: vi.fn(async () => {}) },
    postReel: vi.fn(async (platform) => {
      posts.push(platform)
      return { ok: true, id: `${platform}-id` }
    }),
    sleep: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  }
  return { deps, redis, upserts, posts }
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'video-job-'))
})

describe('runEdition', () => {
  it('dry run renders and previews but never posts or marks done', async () => {
    const { deps, redis, posts } = setup()
    const out = await runEdition(deps, morning!, { dry: true })
    expect(out.status).toBe('dry')
    expect(out.key).toBe('2026-10-17-morning')
    expect(posts).toEqual([])
    expect(deps.telegram.sendPreview).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.telegram.sendPreview).mock.calls[0]![1]).toContain('DRY RUN')
    expect(redis.store.has('video:done:2026-10-17-morning')).toBe(false)
    expect(existsSync(path.join(dir, '2026-10-17-morning', 'captions.json'))).toBe(true)
    const caps = JSON.parse(readFileSync(path.join(dir, '2026-10-17-morning', 'captions.json'), 'utf8'))
    expect(caps.instagram.hashtags.length).toBeLessThanOrEqual(5)
  })

  it('empty VIDEO_PLATFORMS is a dry run too', async () => {
    const { deps, posts } = setup({}, { platforms: [] })
    expect((await runEdition(deps, morning!, { now: true })).status).toBe('dry')
    expect(posts).toEqual([])
  })

  it('posts both platforms, records social posts, sets done, and does not repeat', async () => {
    const { deps, redis, upserts, posts } = setup()
    const out = await runEdition(deps, morning!, { now: true })
    expect(out.status).toBe('posted')
    expect(posts).toEqual(['instagram', 'facebook'])
    expect(deps.sleep).not.toHaveBeenCalled()
    expect(upserts).toHaveLength(2)
    expect(upserts[0]).toMatchObject({ platform: 'instagram', format: 'reel', status: 'posted', externalId: 'instagram-id', via: 'api', idempotencyKey: sha1Hex('video:2026-10-17-morning:instagram') })
    expect(upserts[0]!.article).toBe('100')
    expect(redis.store.get('video:done:2026-10-17-morning')).toBe('posted')
    // a second run is a no-op
    const again = await runEdition(deps, morning!, { now: true })
    expect(again.status).toBe('already-done')
    expect(posts).toHaveLength(2)
    expect(deps.fetchArticles).toHaveBeenCalledTimes(1)
  })

  it('--force still never posts a platform twice (the claim)', async () => {
    const { deps, posts } = setup()
    await runEdition(deps, morning!, { now: true })
    const out = await runEdition(deps, morning!, { now: true, force: true })
    expect(posts).toHaveLength(2)
    expect(out.results!.instagram).toMatch(/already posted/)
  })

  it('waits until render time plus the veto before posting', async () => {
    const { deps } = setup()
    await runEdition(deps, morning!, {})
    // 07:40:05 render start, post at 08:00:00 -> 19m55s
    expect(deps.sleep).toHaveBeenCalledWith(Date.UTC(2026, 9, 17, 3, 0) - NOW)
    expect(vi.mocked(deps.telegram.sendPreview).mock.calls[0]![1]).toContain('Posting at 08:00 PKT to Instagram + Facebook. Tap Skip to cancel.')
  })

  it('honours the skip button', async () => {
    const { deps, redis, posts } = setup()
    redis.store.set('video:skip:2026-10-17-morning', '1')
    const out = await runEdition(deps, morning!, {})
    expect(out.status).toBe('skipped')
    expect(posts).toEqual([])
    expect(vi.mocked(deps.telegram.notify).mock.calls.some((c) => /skipped/i.test(c[0]))).toBe(true)
    expect(redis.store.get('video:done:2026-10-17-morning')).toBe('skipped')
  })

  it('a failed platform is recorded and reported, the other still posts', async () => {
    const { deps, upserts } = setup({
      postReel: vi.fn(async (p) => (p === 'instagram' ? { ok: false, error: 'create container: bad token (code 190)' } : { ok: true, id: 'fb1' })),
    })
    const out = await runEdition(deps, morning!, { now: true })
    expect(out.results).toEqual({ instagram: 'FAILED create container: bad token (code 190)', facebook: 'posted fb1' })
    expect(upserts[0]).toMatchObject({ status: 'failed', error: 'create container: bad token (code 190)' })
    expect(upserts[1]).toMatchObject({ status: 'posted' })
  })

  it('not enough stories: notifies and stops without rendering', async () => {
    const { deps } = setup({ fetchArticles: vi.fn(async () => [article(0), article(1)]) })
    const out = await runEdition(deps, morning!, { now: true })
    expect(out.status).toBe('not-enough')
    expect(deps.render).not.toHaveBeenCalled()
    expect(deps.telegram.notify).toHaveBeenCalledTimes(1)
  })

  it('a render failure notifies and writes a failed social post per platform', async () => {
    const { deps, upserts, posts, redis } = setup({ render: vi.fn(async () => Promise.reject(new Error('QA failed: audio (none)'))) })
    const out = await runEdition(deps, morning!, { now: true })
    expect(out.status).toBe('failed')
    expect(posts).toEqual([])
    expect(upserts.map((u) => [u.platform, u.status, u.error])).toEqual([
      ['instagram', 'failed', 'QA failed: audio (none)'],
      ['facebook', 'failed', 'QA failed: audio (none)'],
    ])
    expect(vi.mocked(deps.telegram.notify).mock.calls[0]![0]).toContain('QA failed')
    expect(redis.store.has('video:done:2026-10-17-morning')).toBe(false)
  })

  it('a failed Telegram preview does not stop posting', async () => {
    const { deps, posts } = setup({ telegram: { sendPreview: vi.fn(async () => Promise.reject(new Error('boom'))), notify: vi.fn(async () => {}) } })
    expect((await runEdition(deps, morning!, { now: true })).status).toBe('posted')
    expect(posts).toHaveLength(2)
  })

  it('the evening edition skips stories the morning used', async () => {
    const { deps, redis } = setup()
    redis.store.set('video:used:2026-10-17', JSON.stringify([100, 101]))
    const evening = parseSlots(undefined).find((s) => s.name === 'evening')!
    const out = await runEdition(deps, evening, { dry: true })
    expect(out.status === 'dry' || out.status === 'not-enough').toBe(true)
    if (out.status === 'dry') {
      const tl = JSON.parse(readFileSync(path.join(out.dir!, 'timeline.json'), 'utf8'))
      const ids = tl.scenes.filter((s: { kind: string }) => s.kind === 'story').map((s: { storyId: number }) => s.storyId)
      expect(ids.slice(0, 3)).not.toContain(100)
    }
  })
})

describe('cleanOld', () => {
  it('deletes edition folders older than 14 days and keeps the rest', () => {
    mkdirSync(path.join(dir, '2026-09-01-morning'))
    mkdirSync(path.join(dir, '2026-10-16-evening'))
    mkdirSync(path.join(dir, 'unrelated'))
    const old = new Date(NOW - 20 * 86400_000)
    utimesSync(path.join(dir, '2026-09-01-morning'), old, old)
    utimesSync(path.join(dir, 'unrelated'), old, old)
    expect(cleanOld(dir, 14, NOW)).toEqual(['2026-09-01-morning'])
    expect(existsSync(path.join(dir, '2026-10-16-evening'))).toBe(true)
    expect(existsSync(path.join(dir, 'unrelated'))).toBe(true)
  })
})
