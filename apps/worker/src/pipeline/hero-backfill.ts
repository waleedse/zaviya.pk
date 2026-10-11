import type { Queue } from 'bullmq'
import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { BridgeServer } from '../bridge/server.js'
import { logger } from '../logger.js'
import { generateHeroViaExtension } from './media.js'
import { generateHeroViaWorkersAI } from './flux.js'
import { describeReferenceScene } from './reference.js'

/**
 * Stories that went out without a hero image (or with only the branded text card) get one
 * afterwards. They stay online the whole time; the image is attached when it is ready.
 * Image path is the same as for new stories: FLUX on Workers AI steered by the real news photo,
 * Gemini web (extension) as backup.
 */

export const HERO_BACKFILL_JOB = 'backfill-hero'
const RETRY_DELAY_MS = 15 * 60_000

export interface HeroBackfillData {
  articleId: string
  title: string
  brief: string
  /** Source article URLs, for the reference scene */
  sourceUrls?: string[]
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
  const scene = await describeReferenceScene(data.sourceUrls ?? [], { geminiApiKey: deps.env.GEMINI_API_KEY, clusterId }).catch(() => null)
  const blob =
    (await generateHeroViaWorkersAI(brief, {
      accountId: deps.env.CLOUDFLARE_ACCOUNT_ID,
      token: deps.env.CLOUDFLARE_AI_TOKEN,
      clusterId,
      scene,
    })) ?? (await generateHeroViaExtension(brief, deps.bridge, clusterId, deps.env.GEMINI_WEB_ACCOUNT))
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
    license: 'ai-generated',
    isAiGenerated: true,
    credit: 'Zaviya',
    filename: `article-${data.articleId}-hero`,
  })
  await deps.payload.request('PATCH', `/api/articles/${data.articleId}?locale=en`, { heroImage: Number(uploaded.id) })
  logger.info({ articleId: data.articleId, mediaId: uploaded.id, title: data.title }, 'hero backfill: image added')
}
