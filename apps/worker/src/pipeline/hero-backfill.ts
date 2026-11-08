import type { Queue } from 'bullmq'
import { fluxCreds, type WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { BridgeServer } from '../bridge/server.js'
import { logger } from '../logger.js'
import { generateHeroViaExtension, geminiAccounts, AI_MEDIA } from './media.js'
import { fluxPrompt, generateHeroViaWorkersAI } from './flux.js'
import { findHeroPhoto, type RealPhoto } from './real-photo.js'

/**
 * Stories that went out without a hero image (or with only the branded text card) get one
 * afterwards. They stay online the whole time; the image is attached when it is ready.
 * Image path is the same as for new stories: a real Wikimedia Commons photo first (real-photo.ts), a generic AI
 * illustration (FLUX on Workers AI, Gemini web as backup) only when none exists.
 * `backfillRealPhotos` swaps real photos into recent stories that went out with an AI hero.
 */

export const HERO_BACKFILL_JOB = 'backfill-hero'
const RETRY_DELAY_MS = 15 * 60_000

export interface HeroBackfillData {
  articleId: string
  title: string
  brief: string
  /** Source article URLs, for the reference scene */
  sourceUrls?: string[]
  dek?: string
  tags?: string[]
  tries?: number
}

interface ArticleDoc {
  id: number | string
  title?: string
  dek?: string
  _status?: string
  heroImage?: { id: number | string; isAiGenerated?: boolean } | number | string | null
  sources?: { url?: string }[]
}

function hasRealHero(a: ArticleDoc): boolean {
  return typeof a.heroImage === 'object' && a.heroImage !== null && a.heroImage.isAiGenerated === true
}

/** Queue an image for every live story without one. Stories stay published. */
export async function queueHeroBackfill(
  payload: PayloadClient,
  mediaQueue: Pick<Queue, 'add'>,
  opts: { dryRun?: boolean; /** Redo these articles even if they already have an image */ ids?: string[] } = {},
) {
  const res = await payload.request<{ docs: ArticleDoc[] }>(
    'GET',
    '/api/articles?where[_status][equals]=published&depth=1&limit=500&locale=en&sort=-publishedAt',
  )
  const missing = opts.ids?.length ? res.docs.filter((a) => opts.ids!.includes(String(a.id))) : res.docs.filter((a) => !hasRealHero(a))
  logger.info({ published: res.docs.length, withoutImage: missing.length, dryRun: Boolean(opts.dryRun) }, 'hero backfill: scan')
  if (opts.dryRun) return { published: res.docs.length, queued: 0, ids: missing.map((a) => String(a.id)) }

  let i = 0
  for (const a of missing) {
    const title = a.title ?? ''
    await mediaQueue.add(
      HERO_BACKFILL_JOB,
      {
        articleId: String(a.id),
        title,
        brief: [title, a.dek].filter(Boolean).join('. '),
        sourceUrls: (a.sources ?? []).map((src) => src.url).filter((u): u is string => Boolean(u)),
      } satisfies HeroBackfillData,
      // Newest first; new stories still go ahead of the backlog (priority 5).
      { priority: 7, delay: i * 1000 },
    )
    i++
  }
  logger.info({ queued: missing.length }, 'hero backfill: stories queued for images (they stay online)')
  return { published: res.docs.length, queued: missing.length, ids: missing.map((a) => String(a.id)) }
}

/** One backfill job: make the image, attach it and republish; otherwise retry later. */
export async function processHeroBackfill(
  data: HeroBackfillData,
  deps: { payload: PayloadClient; env: WorkerEnv; mediaQueue: Pick<Queue, 'add'>; bridge: Pick<BridgeServer, 'isOnline' | 'send'> },
): Promise<void> {
  const brief = data.brief || data.title
  const clusterId = `article_${data.articleId}`
  const real = await findHeroPhoto({ title: data.title, dek: data.dek, brief, tags: data.tags ?? [] }).catch(() => null)
  if (real) {
    const uploaded = await uploadReal(deps.payload, real, data.title, `article-${data.articleId}-photo`)
    await deps.payload.request('PATCH', `/api/articles/${data.articleId}?locale=en`, { heroImage: Number(uploaded.id) })
    logger.info({ articleId: data.articleId, mediaId: uploaded.id, file: real.meta.file, title: data.title }, 'hero backfill: real photo added')
    return
  }
  const blob =
    (await generateHeroViaWorkersAI(brief, {
      ...fluxCreds(deps.env),
      clusterId,
    })) ?? (await generateHeroViaExtension(fluxPrompt(brief), deps.bridge, clusterId, geminiAccounts(deps.env.GEMINI_WEB_ACCOUNT)[0]))
  if (!blob) {
    const tries = (data.tries ?? 0) + 1
    if (tries < deps.env.HERO_IMAGE_MAX_TRIES) {
      await deps.mediaQueue.add(HERO_BACKFILL_JOB, { ...data, tries }, { priority: 7, delay: RETRY_DELAY_MS })
      logger.info({ articleId: data.articleId, tries }, 'hero backfill: no image yet, will retry')
    } else {
      logger.warn({ articleId: data.articleId, title: data.title }, 'hero backfill: gave up, story keeps its card')
    }
    return
  }
  const uploaded = await deps.payload.uploadMedia(blob, {
    alt: data.title,
    ...AI_MEDIA,
    filename: `article-${data.articleId}-hero`,
  })
  await deps.payload.request('PATCH', `/api/articles/${data.articleId}?locale=en`, { heroImage: Number(uploaded.id) })
  logger.info({ articleId: data.articleId, mediaId: uploaded.id, title: data.title }, 'hero backfill: image added')
}

async function uploadReal(payload: PayloadClient, photo: RealPhoto, alt: string, filename: string) {
  return payload.uploadMedia(new Blob([new Uint8Array(photo.bytes)], { type: photo.mime }), {
    alt,
    license: 'wikimedia',
    isAiGenerated: false,
    credit: photo.meta.mediaCredit,
    filename,
  })
}

interface RecentArticle {
  id: number | string
  title?: string
  dek?: string
  publishedAt?: string
  heroImage?: { id: number | string; isAiGenerated?: boolean } | number | string | null
  tags?: ({ name?: string } | number | string)[]
}

export interface RealPhotoBackfillResult {
  scanned: number
  aiHeroes: number
  replaced: number
  noPhoto: number
  failed: number
  items: { id: string; title: string; views: number; status: 'replaced' | 'no-photo' | 'failed' | 'would-try'; file?: string; credit?: string; oldMediaId?: string }[]
}

/**
 * Stories published in the last `days` days whose hero is an AI image get a real Commons photo when one exists, most
 * viewed first. The old media doc stays in the library (only the article's hero pointer changes), so it is reversible.
 */
export async function backfillRealPhotos(
  payload: PayloadClient,
  opts: { days?: number; dryRun?: boolean; limit?: number; find?: typeof findHeroPhoto; pauseMs?: number } = {},
): Promise<RealPhotoBackfillResult> {
  const days = opts.days ?? 7
  const find = opts.find ?? findHeroPhoto
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const res = await payload.request<{ docs: RecentArticle[] }>(
    'GET',
    `/api/articles?where[_status][equals]=published&where[publishedAt][greater_than]=${encodeURIComponent(since)}&depth=1&limit=500&locale=en&sort=-publishedAt`,
  )
  const views = new Map<string, number>()
  try {
    const m = await payload.request<{ docs: { article?: { id?: number | string } | number | string; pageviews?: number }[] }>(
      'GET',
      `/api/metrics-daily?where[date][greater_than]=${encodeURIComponent(since)}&depth=0&limit=2000`,
    )
    for (const d of m.docs) {
      const id = String(typeof d.article === 'object' && d.article ? d.article.id : d.article)
      views.set(id, (views.get(id) ?? 0) + (d.pageviews ?? 0))
    }
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'real-photo backfill: no pageview data, newest first')
  }
  const ai = res.docs
    .filter((a) => typeof a.heroImage === 'object' && a.heroImage !== null && a.heroImage.isAiGenerated === true)
    .sort((a, b) => (views.get(String(b.id)) ?? 0) - (views.get(String(a.id)) ?? 0))
    .slice(0, opts.limit ?? 500)
  const out: RealPhotoBackfillResult = { scanned: res.docs.length, aiHeroes: ai.length, replaced: 0, noPhoto: 0, failed: 0, items: [] }
  logger.info({ scanned: out.scanned, aiHeroes: out.aiHeroes, days, dryRun: Boolean(opts.dryRun) }, 'real-photo backfill: scan')
  for (const a of ai) {
    const id = String(a.id)
    const title = a.title ?? ''
    const item = { id, title, views: views.get(id) ?? 0, oldMediaId: String((a.heroImage as { id: number | string }).id) }
    if (opts.dryRun) {
      out.items.push({ ...item, status: 'would-try' })
      continue
    }
    try {
      const tags = (a.tags ?? []).map((t) => (typeof t === 'object' ? t.name : undefined)).filter((n): n is string => Boolean(n))
      const real = await find({ title, dek: a.dek, tags })
      if (!real) {
        out.noPhoto++
        out.items.push({ ...item, status: 'no-photo' })
      } else {
        const uploaded = await uploadReal(payload, real, title, `article-${id}-photo`)
        await payload.request('PATCH', `/api/articles/${id}?locale=en`, { heroImage: Number(uploaded.id) })
        out.replaced++
        out.items.push({ ...item, status: 'replaced', file: real.meta.file, credit: real.meta.creditLine })
        logger.info({ articleId: id, newMediaId: uploaded.id, oldMediaId: item.oldMediaId, file: real.meta.file }, 'real-photo backfill: hero replaced')
      }
    } catch (e) {
      out.failed++
      out.items.push({ ...item, status: 'failed' })
      logger.warn({ articleId: id, err: e instanceof Error ? e.message : e }, 'real-photo backfill: article failed')
    }
    await new Promise((r) => setTimeout(r, opts.pauseMs ?? 1500))
  }
  logger.info({ scanned: out.scanned, aiHeroes: out.aiHeroes, replaced: out.replaced, noPhoto: out.noPhoto, failed: out.failed }, 'real-photo backfill: done')
  return out
}
