import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaHub, memoryHubStore } from '../media-hub.js'
import { parseSlots } from '../schedule.js'
import { IdeaStore, memoryIdeaRedis, type Idea } from './ideas.js'
import { explainerCaptions, imagePlan, roundKey, runExplainerRound, scriptSentences, shiftAwayFromSlots, type ExplainerDeps } from './run.js'
import type { ExplainerScript } from './script.js'

const NOW = Date.UTC(2026, 9, 24, 4, 0) // 09:00 PKT
const beat = (text: string) => ({ kicker: 'پہلی بات', text, imagePrompt: 'a smartphone and a shield symbol on a plain background' })
const script: ExplainerScript = {
  title: 'How to avoid bank scams',
  titleUr: 'بینک کے دھوکے سے کیسے بچیں',
  beats: [beat('کیا آپ کو ایسا پیغام ملا ہے؟'), beat('یہ ٹھگوں کا طریقہ ہے۔ وہ جلدی میں ڈالتے ہیں۔'), beat('او ٹی پی کسی کو نہ بتائیں۔'), beat('لنک پر کلک نہ کریں۔'), beat('بینک کو خود فون کریں۔')],
  caption: 'چار آسان عادتیں۔',
  hashtags: ['Scam', 'Cybersecurity'],
  facts: [],
  risk: 'low',
}
const evergreen: Idea = { id: 'scam1', title: 'How to avoid bank scams', angle: 'x', origin: 'evergreen', sources: [], tags: [], baseScore: 99, createdAt: NOW, risk: 'low', status: 'backlog' }

function fakeRedis() {
  const m = new Map<string, string>()
  return {
    m,
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string, ...a: (string | number)[]) => {
      if (a.includes('NX') && m.has(k)) return null
      m.set(k, v)
      return 'OK'
    },
  }
}

let agent: ReturnType<typeof setInterval> | undefined
afterEach(() => clearInterval(agent))

function setup(over: Partial<ExplainerDeps> = {}, opts: { agentOnline?: boolean; realClock?: boolean; imagesDone?: number } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'exp-'))
  const hub = new MediaHub(memoryHubStore(), dir, opts.realClock ? Date.now : () => NOW, 5)
  let imagesLeft = opts.imagesDone ?? Infinity
  const redis = fakeRedis()
  const store = new IdeaStore(memoryIdeaRedis())
  const posts: string[] = []
  const upserts: Record<string, unknown>[] = []
  if (opts.agentOnline !== false) void hub.markAgentSeen()
  agent = setInterval(async () => {
    const job = await hub.claim(['tts', 'image'], 'test')
    if (!job) return
    if (job.kind === 'tts') await hub.complete(job.id, Buffer.from('RIFF'), 'audio/wav', { sentenceMs: (job.payload as { sentences: string[] }).sentences.map(() => 3000) })
    else if (imagesLeft-- > 0) await hub.complete(job.id, Buffer.from('PNG'), 'image/png', {})
  }, 5)
  const deps: ExplainerDeps = {
    cfg: { enabled: true, slots: parseSlots(undefined), platforms: ['instagram', 'facebook'], vetoMin: 20, flash: false, trendReel: false, dataDir: dir, bundleDir: '/none', concurrency: 1, siteUrl: 'https://zaviya.pk', keepDays: 14, voiced: false, explainer: false, mediaHubPort: 8790 },
    redis,
    store,
    hub,
    slots: parseSlots(undefined),
    fetchArticles: vi.fn(async () => []),
    fetchTrends: vi.fn(async () => []),
    requestScript: vi.fn(async () => ({ script, model: 'test', sourceUrls: [] })),
    renderNarrated: vi.fn(async ({ outDir }) => ({ mp4: path.join(outDir, 'video.mp4'), cover: path.join(outDir, 'cover.png'), durationMs: 1 })),
    telegram: { sendPreview: vi.fn(async () => {}), notify: vi.fn(async () => {}) },
    postReel: vi.fn(async (platform) => {
      posts.push(platform)
      return { ok: true, id: `${platform}-1` }
    }),
    payload: { upsertSocialPost: vi.fn(async (b) => void upserts.push(b)) },
    sleep: vi.fn(async () => {}),
    now: opts.realClock ? Date.now : () => NOW,
    ...over,
  }
  return { deps, redis, store, posts, upserts, hub }
}

describe('runExplainerRound', () => {
  it('a dry run makes and previews the video but posts nothing', async () => {
    const { deps, posts, store } = setup()
    await store.put(evergreen)
    const out = await runExplainerRound(deps, { dry: true, ideaId: 'scam1' })
    expect(out.status).toBe('dry')
    expect(deps.telegram.sendPreview).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.telegram.sendPreview).mock.calls[0]![1]).toContain('DRY RUN')
    expect(posts).toEqual([])
    expect(deps.renderNarrated).toHaveBeenCalledTimes(1)
  })

  it('posts both platforms, records them, marks the idea made, and never repeats the round', async () => {
    const { deps, posts, upserts, store, redis } = setup()
    await store.put(evergreen)
    const out = await runExplainerRound(deps, { now: true, ideaId: 'scam1' })
    expect(out.status).toBe('posted')
    expect(posts).toEqual(['instagram', 'facebook'])
    expect(upserts).toHaveLength(2)
    expect((await store.get('scam1'))?.status).toBe('made')
    expect(redis.m.get(`explainer:done:${out.key}`)).toBe('posted')
    expect((await runExplainerRound(deps, { now: true, ideaId: 'scam1' })).status).toBe('already-done')
    expect(posts).toHaveLength(2)
  })

  it('makes the video with the pictures that arrived when the Mac is slow, and fails with too few', async () => {
    const some = setup({ assetWaitMs: 400 }, { realClock: true, imagesDone: 2 })
    await some.store.put(evergreen)
    expect((await runExplainerRound(some.deps, { dry: true, ideaId: 'scam1' })).status).toBe('dry')
    expect(some.deps.renderNarrated).toHaveBeenCalledTimes(1)
    clearInterval(agent)

    const few = setup({ assetWaitMs: 400 }, { realClock: true, imagesDone: 1 })
    await few.store.put(evergreen)
    const out = await runExplainerRound(few.deps, { dry: true, ideaId: 'scam1' })
    expect(out.status).toBe('assets-failed')
    expect(few.deps.renderNarrated).not.toHaveBeenCalled()
  })

  it('does not make a video from a script rated medium or high risk', async () => {
    const { deps, store } = setup({ requestScript: vi.fn(async () => ({ script: { ...script, risk: 'medium' as const }, model: 'test', sourceUrls: [] })) })
    await store.put(evergreen)
    const out = await runExplainerRound(deps, { now: true, ideaId: 'scam1' })
    expect(out.status).toBe('script-failed')
    expect(out.error).toMatch(/medium/)
    expect(deps.renderNarrated).not.toHaveBeenCalled()
  })

  it('does nothing when the Mac agent is offline', async () => {
    const { deps, store } = setup({}, { agentOnline: false })
    await store.put(evergreen)
    expect((await runExplainerRound(deps, { now: true })).status).toBe('agent-offline')
    expect(deps.requestScript).not.toHaveBeenCalled()
  })

  it('tells Waleed once a day when the Mac agent is offline', async () => {
    const { deps, store } = setup({}, { agentOnline: false })
    await store.put(evergreen)
    await runExplainerRound(deps, { now: true, round: 'a' })
    await runExplainerRound(deps, { now: true, round: 'b' })
    expect(deps.telegram.notify).toHaveBeenCalledTimes(1)
  })

  it('retires an idea after two failed scripts', async () => {
    const { deps, store } = setup({ requestScript: vi.fn(async () => null) })
    await store.put(evergreen)
    expect((await runExplainerRound(deps, { now: true, ideaId: 'scam1', round: 'r1' })).status).toBe('script-failed')
    expect((await store.get('scam1'))?.decision).toBeUndefined()
    await runExplainerRound(deps, { now: true, ideaId: 'scam1', round: 'r2' })
    expect((await store.get('scam1'))?.decision).toBe('veto')
  })

  it('honours the Skip button and retires that idea', async () => {
    const { deps, redis, store, posts } = setup()
    await store.put(evergreen)
    redis.m.set(`video:skip:${roundKey(NOW)}`, '1')
    const out = await runExplainerRound(deps, { ideaId: 'scam1' })
    expect(out.status).toBe('skipped')
    expect(posts).toEqual([])
    expect((await store.get('scam1'))?.decision).toBe('veto')
  })

  it('waits for the veto time before posting', async () => {
    const { deps, store } = setup()
    await store.put(evergreen)
    await runExplainerRound(deps, { ideaId: 'scam1' })
    expect(deps.sleep).toHaveBeenCalled()
    expect(vi.mocked(deps.sleep).mock.calls[0]![0]).toBeGreaterThanOrEqual(20 * 60_000)
  })
})

describe('imagePlan', () => {
  it('makes fewer pictures than beats and gives every beat one', () => {
    expect(imagePlan(6).count).toBe(4)
    expect(imagePlan(5).count).toBe(4)
    expect(imagePlan(7).count).toBe(5)
    expect(imagePlan(3).count).toBe(3)
    const p = imagePlan(6)
    const used = Array.from({ length: 6 }, (_, i) => p.groupOf(i))
    expect(used).toEqual([0, 0, 1, 2, 2, 3])
    expect(new Set(used).size).toBe(p.count)
  })
})

describe('helpers', () => {
  it('moves a post time away from a scheduled video', () => {
    const slots = parseSlots('morning@07:40=headlines30')
    // 08:00 is the morning video's post time (07:40 render + 20 min veto)
    const eight = Date.UTC(2026, 9, 24, 3, 0)
    expect(shiftAwayFromSlots(eight + 10 * 60_000, slots, 20)).toBe(eight + 45 * 60_000)
    const noon = Date.UTC(2026, 9, 24, 7, 0)
    expect(shiftAwayFromSlots(noon, slots, 20)).toBe(noon)
  })

  it('splits a script into shown and spoken sentences with their beat', () => {
    const s = scriptSentences(script)
    expect(s.map((x) => x.beat)).toEqual([0, 1, 1, 2, 3, 4])
    expect(s.every((x) => /[۔؟]$/.test(x.spoken) && !/\d/.test(x.spoken))).toBe(true)
  })

  it('writes captions with the Urdu hook, the site and at most three hashtags', () => {
    const c = explainerCaptions(script, 'https://zaviya.pk')
    expect(c.instagram.text).toContain('zaviya.pk')
    expect(c.instagram.text.match(/#\w+/g)!.length).toBeLessThanOrEqual(3)
    expect(c.facebook.title).toBe(script.titleUr)
  })
})
