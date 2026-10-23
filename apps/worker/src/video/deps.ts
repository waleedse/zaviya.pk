import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Redis } from 'ioredis'
import type { WorkerEnv } from '../config.js'
import { logger } from '../logger.js'
import { PayloadClient } from '../payload-client.js'
import { TRENDS_KEY } from '../queues-keys.js'
import { postFacebookReel, postInstagramReel } from '../social/reels.js'
import type { VideoConfig } from './config.js'
import type { JobDeps, RedisLike } from './job.js'
import { imageDecodes, makeGradientImage, renderEdition, renderNarrated, type ApiArticle, type ApiDataPoint } from './lib.js'
import type { MediaHub } from './media-hub.js'
import { SCRIPT_WAIT_MS } from './explainer/run.js'
import { narrateEdition } from './narrate-news.js'
import { createVideoTelegram } from './telegram.js'
import { IdeaStore, type IdeaRedis } from './explainer/ideas.js'
import { requestHeadlines, requestScript } from './explainer/script-job.js'
import type { ExplainerDeps } from './explainer/run.js'
import { generateViaZImage } from '../pipeline/zimage.js'
import type { Queue } from 'bullmq'

async function getJson<T>(url: string, tries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
      return (await r.json()) as T
    } catch (e) {
      last = e
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)))
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

export function createJobDeps(env: WorkerEnv, cfg: VideoConfig, redis: Redis, hub?: MediaHub, scriptQueue?: Queue): JobDeps {
  const base = env.PAYLOAD_URL.replace(/\/+$/, '')
  const payload = new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY)
  return {
    cfg,
    redis: redis as unknown as RedisLike,
    payload,
    async fetchArticles(pages) {
      const all: ApiArticle[] = []
      for (let page = 1; page <= pages; page++) {
        const r = await getJson<{ docs: ApiArticle[]; hasNextPage: boolean }>(
          `${base}/api/articles?limit=100&page=${page}&depth=1&sort=-publishedAt&locale=en&where[_status][equals]=published`,
        )
        all.push(...r.docs)
        if (!r.hasNextPage) break
      }
      return all
    },
    async fetchRates() {
      return (await getJson<{ docs: ApiDataPoint[] }>(`${base}/api/data-points?limit=200&sort=-observedAt`)).docs
    },
    async fetchTrends() {
      const raw = await redis.get(TRENDS_KEY)
      if (!raw) return []
      const list = (JSON.parse(raw) as { trends?: unknown[] }).trends ?? []
      return list
        .map((t) => (typeof t === 'string' ? t : ((t as { title?: string; query?: string; name?: string })?.title ?? (t as { query?: string })?.query ?? (t as { name?: string })?.name ?? '')))
        .filter((t): t is string => !!t)
    },
    async prepareImage(url, dir, id, color) {
      const name = `${id}.jpg`
      const file = path.join(dir, name)
      if (url) {
        try {
          const abs = url.startsWith('http') ? url : `${base}${url}`
          const r = await fetch(abs, { signal: AbortSignal.timeout(30_000) })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          await writeFile(file, Buffer.from(await r.arrayBuffer()))
          if (await imageDecodes(file)) return name
          logger.warn({ id }, 'hero image does not decode: using a gradient')
        } catch (e) {
          logger.warn({ id, err: String(e) }, 'hero image download failed: using a gradient')
        }
      }
      await makeGradientImage(color, file)
      return name
    },
    async render({ timeline, outDir, imagesDir }) {
      return renderEdition({ timeline, outDir, imagesDir, bundleDir: cfg.bundleDir, concurrency: cfg.concurrency, browserExecutable: cfg.browserExecutable })
    },
    narrate:
      hub && cfg.voiced
        ? (a) =>
            narrateEdition(
              {
                hub,
                redis,
                now: () => Date.now(),
                requestHeadlines: scriptQueue
                  ? (stories) => requestHeadlines({ redis: redis as never, queue: scriptQueue as never, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() }, stories, 4 * 60_000)
                  : undefined,
              },
              a,
            )
        : undefined,
    async renderNarrated({ timeline, outDir, assetsDir }) {
      return renderNarrated({ timeline, outDir, assetsDir, bundleDir: cfg.bundleDir, concurrency: cfg.concurrency, browserExecutable: cfg.browserExecutable })
    },
    telegram: createVideoTelegram({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_ADMIN_CHAT_ID }),
    async postReel(platform, input) {
      const token = env.META_PAGE_TOKEN
      if (!token) return { ok: false, error: 'META_PAGE_TOKEN is not set' }
      if (platform === 'instagram') {
        if (!env.IG_USER_ID) return { ok: false, error: 'IG_USER_ID is not set' }
        return postInstagramReel({ file: input.file, caption: input.text, thumbOffsetMs: 1200 }, { igUserId: env.IG_USER_ID, token })
      }
      if (!env.META_PAGE_ID) return { ok: false, error: 'META_PAGE_ID is not set' }
      return postFacebookReel({ file: input.file, description: input.text, title: input.title }, { pageId: env.META_PAGE_ID, token })
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  }
}


/** What an explainer round needs: the same posting and rendering as the daily videos, plus the backlog, the hub and the script queue. */
export function createExplainerDeps(env: WorkerEnv, cfg: VideoConfig, redis: Redis, hub: MediaHub, scriptQueue: Queue, jobDeps: JobDeps): { deps: ExplainerDeps; store: IdeaStore } {
  const store = new IdeaStore(redis as unknown as IdeaRedis)
  const deps: ExplainerDeps = {
    cfg,
    redis: redis as unknown as RedisLike,
    store,
    hub,
    slots: cfg.slots,
    fetchArticles: jobDeps.fetchArticles,
    fetchTrends: jobDeps.fetchTrends,
    requestScript: (idea) =>
      requestScript({ redis: redis as never, queue: scriptQueue as never, sleep: jobDeps.sleep, now: jobDeps.now }, idea, SCRIPT_WAIT_MS),
    // when the Mac did not deliver in time and a fal.ai key exists, a Z-Image Turbo picture from the API
    fallbackImage: env.FAL_KEY
      ? async (prompt, width, height) => {
          const blob = await generateViaZImage(prompt, { key: env.FAL_KEY, clusterId: 'explainer', width, height })
          return blob ? Buffer.from(await blob.arrayBuffer()) : null
        }
      : undefined,
    renderNarrated: jobDeps.renderNarrated!,
    telegram: jobDeps.telegram,
    postReel: jobDeps.postReel,
    payload: jobDeps.payload,
    sleep: jobDeps.sleep,
    now: jobDeps.now,
  }
  return { deps, store }
}
