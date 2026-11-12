import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BridgeJob } from '@zaviya/shared'
import { loadYoutubeConfig } from './config.js'
import { blockedReason, itemFromDir, itemId, orderScore, outdatedReason, probeFromTimeline, ytDescription, ytTitle, type YtItem } from './plan.js'
import { backfill, enqueueLive } from './producer.js'
import { YtStore, type YtRedis } from './queue.js'
import { classifyUploadError, uploadNext, MAX_ATTEMPTS, type UploaderDeps } from './uploader.js'
import { youtubeFileResolver } from '../video/media-hub.js'

/** A Redis with just the commands the queue uses */
function fakeRedis(): YtRedis & { strings: Map<string, string> } {
  const hashes = new Map<string, Map<string, string>>()
  const zsets = new Map<string, Map<string, number>>()
  const h = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!
  const z = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!
  return {
    strings: new Map(),
    hget: async (k, f) => h(k).get(f) ?? null,
    hset: async (k, f, v) => void h(k).set(f, v),
    hdel: async (k, f) => void h(k).delete(f),
    hgetall: async (k) => Object.fromEntries(h(k)),
    hlen: async (k) => h(k).size,
    zadd: async (k, s, m) => void z(k).set(m, s),
    zrem: async (k, m) => void z(k).delete(m),
    zrange: async (k, a, b) =>
      [...z(k).entries()]
        .sort((x, y) => x[1] - y[1])
        .map((e) => e[0])
        .slice(a, b + 1),
    zcard: async (k) => z(k).size,
  }
}

const NOW = Date.parse('2026-11-12T12:00:00Z')
const DAY = 86_400_000

function writeEdition(root: string, key: string, files: Record<string, unknown>, ageMs = 0): string {
  const dir = path.join(root, key)
  mkdirSync(dir, { recursive: true })
  const mp4 = path.join(dir, 'video.mp4')
  writeFileSync(mp4, Buffer.alloc(60_000, 1))
  const t = (NOW - ageMs) / 1000
  utimesSync(mp4, t, t)
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), JSON.stringify(body))
  return dir
}

const digestFiles = (title: string, extra = '') => ({
  'captions.json': { youtube: { title, text: `Pakistan News Today\n1. ${title}${extra}\n\nFull stories: https://zaviya.pk/?utm=yt\n\n#PakistanNews #Shorts`, hashtags: ['PakistanNews'] } },
  'timeline.json': { totalFrames: 900, scenes: [{ kind: 'hook' }, { kind: 'story', storyId: 42 }] },
})
const explainerFiles = (title: string, frames = 1500) => ({
  'script.json': {
    idea: { title, angle: 'how it works', articleId: 7, sources: ['https://zaviya.pk/business/load-shedding-explained'] },
    script: { title, titleUr: 'اردو', caption: 'ایک آسان وضاحت', hashtags: ['Energy', 'Pakistan'], beats: [{ kicker: 'Why', text: 'Power plants run on fuel and money.' }] },
  },
  'timeline.json': { totalFrames: frames },
})

describe('wording', () => {
  it('puts #Shorts on a Short only and keeps the title within 100 characters', () => {
    expect(ytTitle('Petrol price in Pakistan today', true)).toBe('Petrol price in Pakistan today #Shorts')
    expect(ytTitle('How load shedding works #Shorts', false)).toBe('How load shedding works')
    const long = ytTitle('x '.repeat(80), true)
    expect(long.length).toBeLessThanOrEqual(100)
    expect(long.endsWith(' #Shorts')).toBe(true)
  })

  it('writes a short description with the story link and the tags', () => {
    const d = ytDescription(['Line one.', 'Line two.'], 'https://zaviya.pk/business/x', ['Explainer', '#Energy'], true)
    expect(d).toContain('Read more on Zaviya: https://zaviya.pk/business/x')
    expect(d).toContain('#Explainer #Energy #Shorts')
  })
})

describe('content guard', () => {
  it.each([
    ['Imran Khan rally in Lahore', 'hard block'],
    ['Army chief meets minister', 'hard block'],
    ['Three killed in blast near market', 'sensitive'],
    ['Eid shopping rush in Lahore', 'religion'],
    ['Cabinet approves new budget', 'sensitive'],
  ])('blocks %s', (text) => {
    expect(blockedReason(text)).not.toBeNull()
  })
  it('lets ordinary explainers through', () => {
    expect(blockedReason('How load shedding works in Pakistan')).toBeNull()
    expect(blockedReason('Petrol price in Pakistan today')).toBeNull()
  })
  it('calls an old price video outdated, an evergreen one not', () => {
    expect(outdatedReason('Petrol price today', NOW - 5 * DAY, NOW)).not.toBeNull()
    expect(outdatedReason('Petrol price today', NOW - DAY, NOW)).toBeNull()
    expect(outdatedReason('How load shedding works', NOW - 9 * DAY, NOW)).toBeNull()
  })
})

describe('itemFromDir', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'yt-'))
  const opts = { siteUrl: 'https://zaviya.pk', probe: probeFromTimeline(30), tier: 2 as const }

  it('builds a Short from a digest folder using the youtube caption', async () => {
    const dir = writeEdition(root, '2026-11-10-evening-headlines30', digestFiles('Rupee gains against dollar'), 2 * DAY)
    const res = await itemFromDir(dir, opts, NOW)
    if ('skip' in res) throw new Error(res.skip)
    expect(res.item).toMatchObject({ kind: 'digest', tier: 2, short: true, articleId: '42', syntheticMedia: false, id: itemId('2026-11-10-evening-headlines30') })
    expect(res.item.title).toBe('Rupee gains against dollar #Shorts')
    expect(res.item.description).toContain('Full stories: https://zaviya.pk')
  })

  it('builds an explainer with the story link, AI-media flag and tier 1', async () => {
    const dir = writeEdition(root, '2026-11-09-r1', explainerFiles('How load shedding works'), 3 * DAY)
    const res = await itemFromDir(dir, opts, NOW)
    if ('skip' in res) throw new Error(res.skip)
    expect(res.item).toMatchObject({ kind: 'explainer', tier: 1, short: true, syntheticMedia: true, articleId: '7' })
    expect(res.item.title).toBe('How load shedding works #Shorts')
    expect(res.item.description).toContain('https://zaviya.pk/business/load-shedding-explained')
    expect(res.item.description).toContain('#Explainer #Energy #Pakistan')
  })

  it('uploads an explainer over three minutes as a normal video, without #Shorts', async () => {
    const dir = writeEdition(root, '2026-11-09-long', explainerFiles('How the power grid works', 30 * 200), 3 * DAY)
    const res = await itemFromDir(dir, opts, NOW)
    if ('skip' in res) throw new Error(res.skip)
    expect(res.item.short).toBe(false)
    expect(res.item.title).toBe('How the power grid works')
    expect(res.item.description).not.toContain('#Shorts')
  })

  it('skips political, army and violent content and an outdated price video', async () => {
    const pol = await itemFromDir(writeEdition(root, '2026-11-08-a', digestFiles('PTI leader arrested')), opts, NOW)
    const viol = await itemFromDir(writeEdition(root, '2026-11-08-b', explainerFiles('Why blasts happen')), opts, NOW)
    const price = await itemFromDir(writeEdition(root, '2026-11-01-c', digestFiles('Petrol price rises by Rs 5'), 11 * DAY), opts, NOW)
    expect(pol).toHaveProperty('skip')
    expect(viol).toHaveProperty('skip')
    expect(price).toEqual({ skip: 'a price or rate that has changed since' })
  })

  it('does not call a brand-new price video outdated', async () => {
    const res = await itemFromDir(writeEdition(root, '2026-11-12-d', digestFiles('Petrol price rises by Rs 5')), { ...opts, tier: 0 }, NOW)
    expect('item' in res && res.item.tier).toBe(0)
  })
})

describe('queue order, idempotency and backfill', () => {
  it('orders live first, then explainers, then digests, oldest first', () => {
    const o = (tier: 0 | 1 | 2, madeAt: number) => orderScore({ tier, madeAt })
    expect(o(0, NOW)).toBeLessThan(o(1, NOW - 10 * DAY))
    expect(o(1, NOW)).toBeLessThan(o(2, NOW - 10 * DAY))
    expect(o(2, NOW - 5 * DAY)).toBeLessThan(o(2, NOW - DAY))
  })

  it('backfills only what was posted, explainers before digests, and never queues one twice', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yt-bf-'))
    writeEdition(root, '2026-11-05-morning-headlines30', digestFiles('Lahore metro bus fare unchanged'), 7 * DAY)
    writeEdition(root, '2026-11-06-r1', explainerFiles('How load shedding works'), 6 * DAY)
    writeEdition(root, '2026-11-07-vetoed', digestFiles('Cricket schedule announced'), 5 * DAY)
    writeEdition(root, '2026-11-08-army', digestFiles('Army chief visits border'), 4 * DAY)
    const store = new YtStore(fakeRedis())
    const posted = async (k: string) => k !== '2026-11-07-vetoed'
    const first = await backfill(store, root, { siteUrl: 'https://zaviya.pk', posted, now: NOW })
    expect(first).toMatchObject({ found: 4, queued: 2, alreadyKnown: 0 })
    expect(first.skipped.map((s) => s.key).sort()).toEqual(['2026-11-07-vetoed', '2026-11-08-army'])
    expect((await store.peek())?.kind).toBe('explainer')
    const again = await backfill(store, root, { siteUrl: 'https://zaviya.pk', posted, now: NOW })
    expect(again).toMatchObject({ queued: 0, alreadyKnown: 2 })
    expect((await store.report()).skipped).toBe(1)
  })

  it('a live video jumps ahead of the backfill and is not queued twice', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yt-live-'))
    const old = writeEdition(root, '2026-11-01-old', explainerFiles('How inflation works'), 11 * DAY)
    const fresh = writeEdition(root, '2026-11-12-fresh', digestFiles('Rupee gains against dollar'))
    const store = new YtStore(fakeRedis())
    await backfill(store, root, { siteUrl: 'https://zaviya.pk', posted: async () => true, now: NOW })
    expect(await enqueueLive(store, fresh, { siteUrl: 'https://zaviya.pk', now: NOW })).toBe('exists')
    expect(old).toBeTruthy()
  })
})

describe('classifyUploadError', () => {
  it.each([
    ['daily_limit_reached: Daily upload limit reached', 'limit'],
    ['needs_human_verification: verify your phone', 'human'],
    ['unknown_job', 'outdated'],
    ['bridge not connected', 'offline'],
    ['post_unsure_no_link: clicked publish', 'unsure'],
    ['bridge job timeout', 'unsure'],
    ['file_input_not_found', 'retry'],
    ['upload_not_finished: Uploading 40%', 'retry'],
  ])('%s -> %s', (msg, kind) => {
    expect(classifyUploadError(msg)).toBe(kind)
  })
})

describe('uploadNext', () => {
  let redis: ReturnType<typeof fakeRedis>
  let store: YtStore
  let now: number
  let sent: BridgeJob[]
  let answer: () => Promise<unknown>
  let posts: Record<string, unknown>[]
  let notes: string[]
  let online: boolean

  const item = (key: string, tier: 0 | 1 | 2 = 1): YtItem => ({
    id: itemId(key),
    key,
    kind: 'explainer',
    tier,
    file: `/data/videos/${key}/video.mp4`,
    title: `Title ${key} #Shorts`,
    description: 'Line\n\nRead more on Zaviya: https://zaviya.pk\n\n#Shorts',
    short: true,
    durationSec: 50,
    articleId: '7',
    syntheticMedia: true,
    madeAt: NOW,
    sizeBytes: 1234567,
    attempts: 0,
  })

  const deps = (): UploaderDeps => ({
    cfg: loadYoutubeConfig({}),
    store,
    bridge: {
      isOnline: () => online,
      send: async (job) => {
        sent.push(job)
        return answer()
      },
    },
    redis: { set: async (k, v) => void redis.strings.set(k, v) },
    payload: { upsertSocialPost: async (b) => void posts.push(b) },
    anchorArticleId: async () => '99',
    notify: async (t) => void notes.push(t),
    now: () => now,
  })

  beforeEach(() => {
    redis = fakeRedis()
    store = new YtStore(redis)
    now = NOW
    sent = []
    posts = []
    notes = []
    online = true
    answer = async () => ({ videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk', visibility: 'public' })
  })

  it('is off with YOUTUBE_SHORTS=0', async () => {
    await store.enqueue(item('a'))
    const d = { ...deps(), cfg: loadYoutubeConfig({ YOUTUBE_SHORTS: '0' }) }
    expect(await uploadNext(d)).toEqual({ state: 'disabled' })
    expect(sent).toHaveLength(0)
  })

  it('uploads through the bridge with a tokenised URL, records the post and waits the gap', async () => {
    await store.enqueue(item('a'))
    await store.enqueue(item('b'))
    const r = await uploadNext(deps())
    expect(r).toMatchObject({ state: 'uploaded', url: 'https://www.youtube.com/watch?v=abcdefghijk' })
    const job = sent[0]!
    expect(job.type).toBe('youtube.upload')
    if (job.type !== 'youtube.upload') throw new Error('type')
    expect(job.payload.videoUrl).toMatch(/^https:\/\/.+\/media\/yt\/[a-f0-9]{32}\.mp4$/)
    expect(job.payload).toMatchObject({ channelId: 'UCCzAybBVt3TIIgvBoSHJy8Q', syntheticMedia: true, sizeBytes: 1234567 })
    const token = /yt\/([a-f0-9]{32})\.mp4/.exec(job.payload.videoUrl)![1]!
    expect(redis.strings.get(`yt:file:${token}`)).toBe('/data/videos/a/video.mp4')
    expect(posts[0]).toMatchObject({ platform: 'youtube', format: 'short', status: 'posted', externalId: 'abcdefghijk', via: 'extension', article: '7' })
    expect(notes[0]).toContain('First YouTube upload')
    // next look is inside the five-minute gap
    expect((await uploadNext(deps())).state).toBe('gap')
    now += 5 * 60_000 + 1
    expect((await uploadNext(deps())).state).toBe('uploaded')
    expect(sent).toHaveLength(2)
  })

  it('sleeps on "Daily upload limit reached", keeps the video, and resumes by itself', async () => {
    await store.enqueue(item('a'))
    answer = async () => {
      throw new Error('daily_limit_reached: Daily upload limit reached')
    }
    expect((await uploadNext(deps())).state).toBe('paused')
    expect(notes.some((n) => /daily upload limit/i.test(n))).toBe(true)
    expect((await store.report()).queued).toBe(1)
    now += 60 * 60_000
    expect((await uploadNext(deps())).state).toBe('paused')
    expect(sent).toHaveLength(1)
    now += 4 * 3_600_000
    answer = async () => ({ videoId: 'abcdefghijk', url: 'https://www.youtube.com/watch?v=abcdefghijk' })
    expect((await uploadNext(deps())).state).toBe('uploaded')
  })

  it('waits while the extension is offline', async () => {
    await store.enqueue(item('a'))
    online = false
    expect((await uploadNext(deps())).state).toBe('offline')
    expect(sent).toHaveLength(0)
  })

  it('an old extension pauses the queue instead of burning attempts', async () => {
    await store.enqueue(item('a'))
    answer = async () => {
      throw new Error('unknown_job')
    }
    const r = await uploadNext(deps())
    expect(r.state).toBe('paused')
    expect((await store.peek())?.attempts).toBe(0)
  })

  it('retries a failed attempt, then gives up after the maximum and records the error', async () => {
    await store.enqueue(item('a'))
    answer = async () => {
      throw new Error('details_not_shown: dialog "Select files"')
    }
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect((await uploadNext(deps())).state).toBe('retry')
      now += 20 * 60_000
    }
    expect((await uploadNext(deps())).state).toBe('failed')
    expect((await store.report()).failed).toBe(1)
    expect(posts.at(-1)).toMatchObject({ status: 'failed', platform: 'youtube' })
    expect(await store.peek()).toBeNull()
  })

  it('never repeats an upload whose outcome is unknown', async () => {
    await store.enqueue(item('a'))
    answer = async () => {
      throw new Error('post_unsure_no_link: publish was clicked')
    }
    expect((await uploadNext(deps())).state).toBe('failed')
    expect(await store.peek()).toBeNull()
    expect(notes.at(-1)).toMatch(/Check the channel/)
  })

  it('a blocked item is dropped at upload time without touching YouTube', async () => {
    await store.enqueue({ ...item('a'), title: 'PTI rally in Lahore #Shorts' })
    expect((await uploadNext(deps())).state).toBe('dropped')
    expect(sent).toHaveLength(0)
  })
})

describe('media hub file route', () => {
  it('serves only a minted token and only from inside the data dir', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yt-hub-'))
    const file = path.join(root, 'k', 'video.mp4')
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'x')
    const tok = 'a'.repeat(32)
    const get = vi.fn(async (k: string) => (k === `yt:file:${tok}` ? file : k === `yt:file:${'b'.repeat(32)}` ? '/etc/passwd' : null))
    const resolve = youtubeFileResolver({ get }, root)
    expect(await resolve(`/yt/${tok}.mp4`)).toBe(file)
    expect(await resolve(`/yt/${'b'.repeat(32)}.mp4`)).toBeNull()
    expect(await resolve(`/yt/${'c'.repeat(32)}.mp4`)).toBeNull()
    expect(await resolve('/yt/../etc/passwd')).toBeNull()
  })
})
