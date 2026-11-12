/**
 * The YouTube uploader: one video at a time from the queue, through the Chrome extension (youtube.upload bridge job).
 * It runs in the main worker (which owns the bridge). The MP4 itself lives in the video service; the uploader mints a
 * short-lived token the media hub turns into the file, and the extension downloads it from that URL.
 *
 * Pacing: a few minutes between uploads; on "Daily upload limit reached" the whole queue sleeps and resumes by itself.
 */
import { randomBytes } from 'node:crypto'
import type { BridgeJob } from '@zaviya/shared'
import { sha1Hex } from '../lib/idempotency.js'
import { logger } from '../logger.js'
import type { YoutubeConfig } from './config.js'
import { blockedReason, type YtItem } from './plan.js'
import { fileKey, type YtStore } from './queue.js'

export type UploadErrorKind = 'limit' | 'human' | 'outdated' | 'offline' | 'unsure' | 'retry'

/** What an extension error means for the queue */
export function classifyUploadError(message: string): UploadErrorKind {
  const m = message.trim()
  if (/^daily_limit_reached/.test(m)) return 'limit'
  if (/^needs_human/.test(m)) return 'human'
  if (/^(unknown_job|platform_disabled)/.test(m)) return 'outdated'
  if (/^bridge not connected/.test(m)) return 'offline'
  // publish may or may not have happened: never repeat, a person looks at the channel
  if (/^(post_unsure|bridge job timeout)/.test(m)) return 'unsure'
  return 'retry'
}

/** The first extension build that knows youtube.upload: an older one ignores the job without answering, so nothing may be sent to it */
export const MIN_EXTENSION_VERSION = '0.5.0'

export function versionAtLeast(version: string | null, min: string): boolean {
  if (!version) return false
  const a = version.split('.').map((n) => parseInt(n, 10) || 0)
  const b = min.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return true
}

/**
 * How long the worker waits for the extension. The extension's own worst case is a download (up to 5 min), a first try that fails
 * after about 90 s, and a second try with the upload itself (a 20 MB explainer over a home line took over 10 min) and a 15 min cap on
 * Studio's "Done" button: the worker must outlast all of it, or a good upload is recorded as "unknown outcome".
 */
export const BRIDGE_TIMEOUT_MS = 50 * 60_000

export const MAX_ATTEMPTS = 3
/** a failed attempt waits this long before the next one (the same Studio page may need a moment) */
export const RETRY_PAUSE_MS = 10 * 60_000
export const OUTDATED_PAUSE_MS = 30 * 60_000
export const HUMAN_PAUSE_MS = 6 * 3_600_000
export const OFFLINE_RECHECK_MS = 60_000

export interface UploaderDeps {
  cfg: YoutubeConfig
  store: YtStore
  bridge: { isOnline(): boolean; extensionVersion(): string | null; send(job: BridgeJob, timeoutMs?: number): Promise<unknown> }
  redis: { set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown> }
  payload: { upsertSocialPost(body: Record<string, unknown> & { idempotencyKey: string; article: string; platform: string; format: string; copy: string; mediaUrls: string[]; status: string }): Promise<unknown> }
  /** the newest article, for videos that are not about one */
  anchorArticleId(): Promise<string>
  notify(text: string): Promise<void>
  now(): number
}

export type TickResult =
  | { state: 'disabled' | 'busy' | 'offline' | 'idle' }
  | { state: 'paused'; until: number; reason: string }
  | { state: 'gap'; until: number }
  | { state: 'uploaded'; id: string; url: string }
  | { state: 'retry' | 'failed' | 'dropped'; id: string; error: string }

let running = false

async function record(deps: UploaderDeps, item: YtItem, status: 'posted' | 'failed', extra: { videoId?: string; url?: string; error?: string }): Promise<void> {
  const article = item.articleId ?? (await deps.anchorArticleId().catch(() => '1'))
  await deps.payload
    .upsertSocialPost({
      idempotencyKey: sha1Hex(`youtube:${item.key}`),
      article,
      platform: 'youtube',
      format: item.short ? 'short' : 'video',
      copy: `${item.title}\n\n${item.description}`.slice(0, 5000),
      mediaUrls: extra.url ? [extra.url] : [],
      status,
      externalId: extra.videoId,
      via: 'extension',
      error: extra.error,
      postedAt: status === 'posted' ? new Date(deps.now()).toISOString() : undefined,
    })
    .catch((e: unknown) => logger.warn({ err: String(e), key: item.key }, 'could not record the YouTube post'))
}

/** On start: an upload that was running when the worker stopped may or may not have been published; it is not repeated blindly. */
export async function recoverInflight(deps: UploaderDeps): Promise<void> {
  const st = await deps.store.state()
  if (!st.inflight) return
  const item = await deps.store.get(st.inflight)
  await deps.store.setState({ inflight: null })
  if (!item) return
  const error = 'the worker restarted during the upload: check the channel before uploading again'
  await deps.store.fail(item, error, deps.now())
  await record(deps, item, 'failed', { error })
  await deps.notify(`YouTube: ${item.key} was being uploaded when the worker restarted. Check the channel for a duplicate or a missing video.`).catch(() => undefined)
}

/** One look at the queue: uploads at most one video. */
export async function uploadNext(deps: UploaderDeps): Promise<TickResult> {
  const { cfg, store } = deps
  if (!cfg.enabled) return { state: 'disabled' }
  if (running) return { state: 'busy' }
  const now = deps.now()
  const st = await store.state()
  if (st.pausedUntil && st.pausedUntil > now) return { state: 'paused', until: st.pausedUntil, reason: st.pauseReason ?? '' }
  if (st.lastUploadAt && st.lastUploadAt + cfg.minGapMs > now) return { state: 'gap', until: st.lastUploadAt + cfg.minGapMs }
  if (!deps.bridge.isOnline()) return { state: 'offline' }
  if (!versionAtLeast(deps.bridge.extensionVersion(), MIN_EXTENSION_VERSION)) {
    return { state: 'paused', until: now + OFFLINE_RECHECK_MS, reason: `the Chrome extension is ${deps.bridge.extensionVersion() ?? 'unknown'}, youtube.upload needs ${MIN_EXTENSION_VERSION}: reload it at chrome://extensions` }
  }
  const item = await store.peek()
  if (!item) return { state: 'idle' }

  running = true
  try {
    // the guard runs again at upload time: the rules may have grown since the video was queued
    const blocked = blockedReason(`${item.title} ${item.description}`)
    if (blocked) {
      await store.skip(item.id, item.key, `${blocked} (at upload time)`, now)
      await store.fail(item, `blocked: ${blocked}`, now)
      return { state: 'dropped', id: item.id, error: blocked }
    }
    const token = randomBytes(16).toString('hex')
    await deps.redis.set(fileKey(token), item.file, 'EX', 40 * 60)
    await store.setState({ inflight: item.id })
    const job: BridgeJob = {
      id: `yt_${item.id}_${now}`,
      type: 'youtube.upload',
      payload: {
        videoUrl: `${cfg.mediaBase}/yt/${token}.mp4`,
        title: item.title,
        description: item.description,
        fileName: `${item.key}.mp4`,
        ...(item.sizeBytes ? { sizeBytes: item.sizeBytes } : {}),
        channelId: cfg.channelId,
        syntheticMedia: item.syntheticMedia,
      },
    }
    logger.info({ key: item.key, kind: item.kind, short: item.short, title: item.title }, 'YouTube upload starting')
    try {
      const res = (await deps.bridge.send(job, BRIDGE_TIMEOUT_MS)) as { videoId?: string; url?: string }
      if (!res?.videoId || !res.url) throw new Error('post_unsure: the extension returned no video link')
      await store.complete(item, { videoId: res.videoId, url: res.url, at: deps.now(), title: item.title, short: item.short })
      await store.setState({ inflight: null, lastUploadAt: deps.now(), pausedUntil: null, pauseReason: null })
      await record(deps, item, 'posted', { videoId: res.videoId, url: res.url })
      logger.info({ key: item.key, url: res.url }, 'YouTube upload published')
      if ((await store.report()).done === 1) await deps.notify(`First YouTube upload is live: ${res.url}`).catch(() => undefined)
      return { state: 'uploaded', id: item.id, url: res.url }
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 1500)
      await store.setState({ inflight: null, lastUploadAt: deps.now() })
      const kind = classifyUploadError(error)
      logger.warn({ key: item.key, kind, error }, 'YouTube upload did not finish')
      const pause = async (ms: number, reason: string) => {
        const until = deps.now() + ms
        await store.setState({ pausedUntil: until, pauseReason: reason })
        return { state: 'paused', until, reason } as const
      }
      if (kind === 'limit') {
        const was = (await store.state()).pauseReason
        if (was !== 'daily upload limit') await deps.notify('YouTube: daily upload limit reached. The queue sleeps and resumes by itself.').catch(() => undefined)
        return pause(cfg.limitPauseMs, 'daily upload limit')
      }
      if (kind === 'human') {
        await deps.notify(`YouTube needs a person (Studio asked for verification or a login): ${error.slice(0, 300)}`).catch(() => undefined)
        return pause(HUMAN_PAUSE_MS, 'needs a person in Studio')
      }
      if (kind === 'outdated') return pause(OUTDATED_PAUSE_MS, 'the Chrome extension has no youtube.upload yet: reload it at chrome://extensions')
      if (kind === 'offline') return pause(OFFLINE_RECHECK_MS, 'extension offline')
      if (kind === 'unsure') {
        await store.fail(item, error, deps.now())
        await record(deps, item, 'failed', { error })
        await deps.notify(`YouTube: ${item.key} may or may not be published (${error.slice(0, 200)}). Check the channel; it will not be uploaded again.`).catch(() => undefined)
        return { state: 'failed', id: item.id, error }
      }
      const next: YtItem = { ...item, attempts: item.attempts + 1 }
      if (next.attempts >= MAX_ATTEMPTS) {
        await store.fail(item, error, deps.now())
        await record(deps, item, 'failed', { error })
        await deps.notify(`YouTube: ${item.key} failed ${MAX_ATTEMPTS} times: ${error.slice(0, 300)}`).catch(() => undefined)
        return { state: 'failed', id: item.id, error }
      }
      await store.update(next)
      await pause(RETRY_PAUSE_MS, `retrying ${item.key} after: ${error.slice(0, 120)}`)
      return { state: 'retry', id: item.id, error }
    }
  } finally {
    running = false
  }
}

/** The loop the worker starts; returns the stop function */
export function startUploader(deps: UploaderDeps): () => void {
  void recoverInflight(deps).catch((e) => logger.warn({ err: String(e) }, 'YouTube inflight recovery failed'))
  const timer = setInterval(() => {
    uploadNext(deps).catch((e) => logger.warn({ err: String(e) }, 'YouTube uploader tick failed'))
  }, deps.cfg.tickMs)
  logger.info({ enabled: deps.cfg.enabled, channel: deps.cfg.channelId, minGapMin: deps.cfg.minGapMs / 60_000 }, 'YouTube uploader started')
  return () => clearInterval(timer)
}
