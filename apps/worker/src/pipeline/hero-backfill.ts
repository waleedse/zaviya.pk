import type { Queue } from 'bullmq'
import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { BridgeServer } from '../bridge/server.js'
import { logger } from '../logger.js'
import { generateHeroViaExtension } from './media.js'

/**
 * Stories published before the "real image or nothing" rule carry only the branded text card.
 * They are taken offline, each gets a Gemini illustration through the extension, and goes
 * back online as soon as its image is attached.
 */

export const HERO_BACKFILL_JOB = 'backfill-hero'
const RETRY_DELAY_MS = 15 * 60_000

export interface HeroBackfillData {
  articleId: string
  title: string
  brief: string
  tries?: number
}

interface ArticleDoc {
  id: number | string
  title?: string
  dek?: string
  _status?: string
  heroImage?: { id: number | string; isAiGenerated?: boolean } | number | string | null
}

function hasRealHero(a: ArticleDoc): boolean {
  return typeof a.heroImage === 'object' && a.heroImage !== null && a.heroImage.isAiGenerated === true
}

/** Unpublish every live story without a Gemini image and queue an image for each. */
export async function queueHeroBackfill(payload: PayloadClient, mediaQueue: Pick<Queue, 'add'>, opts: { dryRun?: boolean } = {}) {
  const res = await payload.request<{ docs: ArticleDoc[] }>(
    'GET',
    '/api/articles?where[_status][equals]=published&depth=1&limit=500&locale=en&sort=-publishedAt',
  )
  const missing = res.docs.filter((a) => !hasRealHero(a))
  logger.info({ published: res.docs.length, withoutImage: missing.length, dryRun: Boolean(opts.dryRun) }, 'hero backfill: scan')
  if (opts.dryRun) return { published: res.docs.length, queued: 0, ids: missing.map((a) => String(a.id)) }

  let i = 0
  for (const a of missing) {
    await payload.request('PATCH', `/api/articles/${a.id}?locale=en`, { _status: 'draft' })
    const title = a.title ?? ''
    await mediaQueue.add(
      HERO_BACKFILL_JOB,
      { articleId: String(a.id), title, brief: [title, a.dek].filter(Boolean).join('. ') } satisfies HeroBackfillData,
      // Newest first; new stories still go ahead of the backlog (priority 5).
      { priority: 7, delay: i * 1000 },
    )
    i++
  }
  logger.info({ unpublished: missing.length }, 'hero backfill: stories taken offline and queued for images')
  return { published: res.docs.length, queued: missing.length, ids: missing.map((a) => String(a.id)) }
}

/** One backfill job: make the image, attach it and republish; otherwise retry later. */
export async function processHeroBackfill(
  data: HeroBackfillData,
  deps: { payload: PayloadClient; env: WorkerEnv; mediaQueue: Pick<Queue, 'add'>; bridge: Pick<BridgeServer, 'isOnline' | 'send'> },
): Promise<void> {
  const blob = await generateHeroViaExtension(data.brief || data.title, deps.bridge, `article_${data.articleId}`, deps.env.GEMINI_WEB_ACCOUNT)
  if (!blob) {
    const tries = (data.tries ?? 0) + 1
    if (tries < deps.env.HERO_IMAGE_MAX_TRIES) {
      await deps.mediaQueue.add(HERO_BACKFILL_JOB, { ...data, tries }, { priority: 7, delay: RETRY_DELAY_MS })
      logger.info({ articleId: data.articleId, tries }, 'hero backfill: no image yet, will retry')
    } else {
      logger.warn({ articleId: data.articleId, title: data.title }, 'hero backfill: gave up, story stays offline')
    }
    return
  }
  const uploaded = await deps.payload.uploadMedia(blob, {
    alt: data.title,
    license: 'ai-generated',
    isAiGenerated: true,
    credit: 'Zaviya',
    filename: `article-${data.articleId}-hero`,
  })
  await deps.payload.request('PATCH', `/api/articles/${data.articleId}?locale=en`, { heroImage: Number(uploaded.id), _status: 'published' })
  logger.info({ articleId: data.articleId, mediaId: uploaded.id, title: data.title }, 'hero backfill: image added, story back online')
}
