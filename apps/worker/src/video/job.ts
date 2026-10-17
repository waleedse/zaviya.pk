import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CATEGORIES } from '@zaviya/shared'
import { sha1Hex } from '../lib/idempotency.js'
import { logger } from '../logger.js'
import type { ReelResult } from '../social/reels.js'
import type { VideoConfig, VideoPlatform } from './config.js'
import {
  buildAllCaptions,
  compose,
  NotEnoughStories,
  selectEdition,
  type ApiArticle,
  type ApiDataPoint,
  type Captions,
  type Platform,
  type Timeline,
} from './lib.js'
import { editionKey, hhmm, karachiDate, postAtMs, type Slot } from './schedule.js'
import type { VideoTelegram } from './telegram.js'

export interface RedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>
}

export interface JobDeps {
  cfg: VideoConfig
  redis: RedisLike
  payload: { upsertSocialPost(body: Record<string, unknown> & { idempotencyKey: string; article: string; platform: string }): Promise<unknown> }
  fetchArticles(pages: number): Promise<ApiArticle[]>
  fetchRates(): Promise<ApiDataPoint[]>
  fetchTrends(): Promise<string[]>
  /** downloads a hero image (or makes a category gradient) and returns its file name inside `dir` */
  prepareImage(url: string | undefined, dir: string, id: number, color: string): Promise<string>
  render(args: { timeline: Timeline; outDir: string; imagesDir: string }): Promise<{ mp4: string; cover: string; durationMs: number }>
  telegram: VideoTelegram
  postReel(platform: VideoPlatform, input: { file: string; text: string; title?: string }): Promise<ReelResult>
  sleep(ms: number): Promise<void>
  now(): number
}

export interface RunOptions {
  /** post with no wait */
  now?: boolean
  /** render and preview, never post */
  dry?: boolean
  /** ignore `video:done:<key>` (the per-platform `video:posted` claims still apply) */
  force?: boolean
  /** breaking flash: the one article to use */
  articleId?: number
  /** minutes between preview and posting (default: the configured veto) */
  vetoMin?: number
}

export interface Outcome {
  status: 'already-done' | 'not-enough' | 'failed' | 'skipped' | 'dry' | 'posted'
  key: string
  error?: string
  dir?: string
  mp4?: string
  renderMs?: number
  results?: Record<string, string>
}

const NAMES: Record<VideoPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook' }
const DONE_TTL = 30 * 86400

/** One edition, start to finish. Idempotent per key and per platform. */
export async function runEdition(deps: JobDeps, slot: Slot, opts: RunOptions = {}): Promise<Outcome> {
  const { cfg, redis, telegram } = deps
  const startedAt = deps.now()
  const key = editionKey(slot, startedAt)
  const log = logger.child({ key, format: slot.format })

  // 1. already done (a restart or a second scheduler tick must never repeat an edition)
  if (!opts.force && (await redis.get(`video:done:${key}`))) {
    log.info('edition already done')
    return { status: 'already-done', key }
  }

  const dir = path.join(cfg.dataDir, key)
  const imagesDir = path.join(dir, 'images')
  mkdirSync(imagesDir, { recursive: true })
  let leadId: number | undefined

  const fail = async (e: unknown): Promise<Outcome> => {
    const msg = e instanceof Error ? e.message : String(e)
    log.error({ err: msg }, 'video edition failed')
    await telegram.notify(`Video ${key} failed: ${msg}`.slice(0, 3500)).catch(() => {})
    if (leadId !== undefined && !opts.dry) {
      for (const platform of cfg.platforms) {
        await deps.payload
          .upsertSocialPost({
            idempotencyKey: sha1Hex(`video:${key}:${platform}`),
            article: String(leadId),
            platform,
            format: 'reel',
            copy: `Daily video ${key}`,
            mediaUrls: [],
            status: 'failed',
            via: 'api',
            error: msg.slice(0, 1500),
          })
          .catch((err: unknown) => log.warn({ err: String(err) }, 'could not record failed social post'))
      }
    }
    return { status: 'failed', key, error: msg, dir }
  }

  let timeline: Timeline
  let captions: Record<Platform, Captions>
  let mp4: string
  let renderMs: number
  try {
    // 2. data and selection
    const date = new Date(startedAt).toISOString()
    const day = karachiDate(startedAt)
    const usedKey = `video:used:${day}`
    const used = new Set<number>(JSON.parse((await redis.get(usedKey)) ?? '[]') as number[])
    const [articles, rates, trends] = await Promise.all([
      deps.fetchArticles(slot.format === 'topic60' ? 6 : 1),
      deps.fetchRates(),
      deps.fetchTrends().catch(() => [] as string[]),
    ])
    const { input, picked } = selectEdition({
      articles,
      rates,
      format: slot.format,
      edition: slot.edition,
      topic: slot.topic,
      date,
      exclude: slot.edition === 'evening' ? used : undefined,
      onlyId: opts.articleId,
    })

    // 3. photos (a missing or broken photo becomes a category gradient)
    for (const [i, story] of input.stories.entries()) {
      const color = CATEGORIES.find((c) => c.slug === story.category)?.color ?? '#555555'
      story.image = await deps.prepareImage(picked[i]?.heroImage?.url, imagesDir, story.id, color)
    }
    try {
      timeline = compose(input, slot.format)
    } catch (e) {
      if (e instanceof NotEnoughStories) {
        await telegram.notify(`Video ${key} skipped: ${e.message} (${slot.format})`).catch(() => {})
        log.warn({ have: e.have }, 'not enough stories')
        return { status: 'not-enough', key, error: e.message, dir }
      }
      throw e
    }
    const lead = timeline.scenes.find((s) => s.kind === 'story')
    leadId = lead?.kind === 'story' ? lead.storyId : input.stories[0]?.id

    const r = await deps.render({ timeline, outDir: dir, imagesDir })
    mp4 = r.mp4
    renderMs = r.durationMs

    // 4. captions and files
    captions = buildAllCaptions(timeline, input.stories, cfg.siteUrl, trends)
    writeFileSync(path.join(dir, 'captions.json'), JSON.stringify(captions, null, 2))
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 2))
    const ids = new Set([...used, ...input.stories.map((s) => s.id)])
    await redis.set(usedKey, JSON.stringify([...ids]), 'EX', 2 * 86400)
  } catch (e) {
    return fail(e)
  }

  // 5. preview
  const postAt = postAtMs(slot, startedAt, opts.vetoMin ?? cfg.vetoMin)
  const targets = cfg.platforms.map((p) => NAMES[p]).join(' + ')
  const hook = timeline.scenes[0]?.kind === 'hook' ? timeline.scenes[0].title.join(' ') : timeline.format
  const caption =
    opts.dry || !cfg.platforms.length
      ? `${hook} (${key})\nDRY RUN: nothing will be posted.`
      : `${hook} (${key})\nPosting at ${hhmm(opts.now ? deps.now() : postAt)} PKT to ${targets}. Tap Skip to cancel.`
  try {
    await telegram.sendPreview(mp4, caption, key)
  } catch (e) {
    log.warn({ err: String(e) }, 'telegram preview failed')
    await telegram.notify(`Video ${key} rendered but the preview could not be sent: ${String(e).slice(0, 300)}`).catch(() => {})
  }

  if (opts.dry || !cfg.platforms.length) {
    log.info({ mp4, renderMs }, 'dry run finished: nothing posted')
    return { status: 'dry', key, dir, mp4, renderMs }
  }

  // 6. wait until the post time, then honour the skip button
  if (!opts.now) {
    const wait = postAt - deps.now()
    if (wait > 0) await deps.sleep(wait)
  }
  if (await redis.get(`video:skip:${key}`)) {
    await telegram.notify(`Video ${key} skipped (Skip button).`).catch(() => {})
    await redis.set(`video:done:${key}`, 'skipped', 'EX', DONE_TTL)
    return { status: 'skipped', key, dir, mp4, renderMs }
  }

  // 7. post, each platform claimed first so it can never go out twice
  const results: Record<string, string> = {}
  for (const platform of cfg.platforms) {
    const claimed = await redis.set(`video:posted:${key}:${platform}`, '1', 'EX', 172800, 'NX')
    if (!claimed) {
      results[platform] = 'already posted or claimed: not posting again'
      continue
    }
    const copy = captions[platform]
    let result: ReelResult
    try {
      result = await deps.postReel(platform, { file: mp4, text: copy.text, title: copy.title })
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    await deps.payload
      .upsertSocialPost({
        idempotencyKey: sha1Hex(`video:${key}:${platform}`),
        article: String(leadId),
        platform,
        format: 'reel',
        copy: copy.text,
        mediaUrls: [],
        status: result.ok ? 'posted' : 'failed',
        externalId: result.id,
        via: 'api',
        error: result.error,
        postedAt: result.ok ? new Date(deps.now()).toISOString() : undefined,
      })
      .catch((err: unknown) => log.warn({ platform, err: String(err) }, 'could not record social post'))
    results[platform] = result.ok ? `posted ${result.id}` : `FAILED ${result.error}`
  }

  // 8. result
  const anyOk = Object.values(results).some((r) => r.startsWith('posted'))
  await telegram
    .notify(`Video ${key}: ${Object.entries(results).map(([p, r]) => `${NAMES[p as VideoPlatform]} ${r}`).join('; ')}`)
    .catch(() => {})
  await redis.set(`video:done:${key}`, anyOk ? 'posted' : 'failed', 'EX', DONE_TTL)

  // 9. old files
  cleanOld(cfg.dataDir, cfg.keepDays, deps.now())
  return { status: 'posted', key, dir, mp4, renderMs, results }
}

/** Delete edition folders older than `days` */
export function cleanOld(dataDir: string, days: number, nowMs: number): string[] {
  const removed: string[] = []
  try {
    for (const name of readdirSync(dataDir)) {
      if (!/^\d{4}-\d{2}-\d{2}-/.test(name)) continue
      const p = path.join(dataDir, name)
      if (nowMs - statSync(p).mtimeMs > days * 86400_000) {
        rmSync(p, { recursive: true, force: true })
        removed.push(name)
      }
    }
  } catch {
    /* data dir missing: nothing to clean */
  }
  return removed
}
