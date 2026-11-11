import type { Queue } from 'bullmq'
import { fluxCreds, type WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { BridgeServer } from '../bridge/server.js'
import { logger } from '../logger.js'
import { generateHeroViaExtension, geminiAccounts, AI_MEDIA, absoluteMediaUrl } from './media.js'
import { fluxPrompt, generateHeroViaWorkersAI } from './flux.js'
import { findHeroImage, uploadHeroPhoto, uploadBrandCard, heroKindOf, type HeroInput } from './hero-photo.js'
import type { RealPhoto } from './real-photo.js'
import { documentNameReason, documentPixelReason } from './photo-qa.js'

/**
 * Stories that went out without a hero image (or with only the branded text card) get one
 * afterwards. They stay online the whole time; the image is attached when it is ready.
 * Image path is the same as for new stories (hero-photo.ts): a real Commons photo of the named subject, else a real
 * Openverse photo of the topic, else the branded card. AI illustrations only when AI_HERO_IMAGES is on (default off).
 * `backfillRealPhotos` fixes recent stories whose hero is an AI image, missing, or a document/screenshot.
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
  const real = await findHeroImage({ title: data.title, dek: data.dek, brief, tags: data.tags ?? [] }).catch(() => null)
  if (real) {
    const uploaded = await uploadHeroPhoto(deps.payload, real, data.title, `article-${data.articleId}-photo`)
    await deps.payload.request('PATCH', `/api/articles/${data.articleId}?locale=en`, { heroImage: Number(uploaded.id) })
    logger.info({ articleId: data.articleId, mediaId: uploaded.id, file: real.meta.file, kind: heroKindOf(real), title: data.title }, 'hero backfill: real photo added')
    return
  }
  // No real photo: AI illustrations only when switched on (off since 13 Nov 2026); otherwise look again later, then keep the branded card.
  const blob = deps.env.AI_HERO_IMAGES
    ? ((await generateHeroViaWorkersAI(brief, {
        ...fluxCreds(deps.env),
        clusterId,
      })) ?? (await generateHeroViaExtension(fluxPrompt(brief), deps.bridge, clusterId, geminiAccounts(deps.env.GEMINI_WEB_ACCOUNT)[0])))
    : null
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

interface HeroMedia {
  id: number | string
  isAiGenerated?: boolean
  license?: string
  credit?: string
  filename?: string
  alt?: string
  url?: string | null
  sizes?: Record<string, { url?: string | null } | undefined>
}

interface RecentArticle {
  id: number | string
  title?: string
  dek?: string
  publishedAt?: string
  heroImage?: HeroMedia | number | string | null
  category?: { slug?: string } | number | string | null
  tags?: ({ name?: string } | number | string)[]
}

export type HeroProblem = 'missing' | 'ai' | 'document' | 'card'

export interface HeroFixResult {
  scanned: number
  /** Stories whose hero is missing, AI-generated, a document/screenshot, or the branded card (card: only upgraded when a photo is found) */
  candidates: number
  replacedCommons: number
  replacedOpenverse: number
  /** Missing, AI or document heroes for which no photo exists: the branded card now */
  brandedCard: number
  unchanged: number
  failed: number
  /** Headlines for which no real photo could be found */
  noPhoto: string[]
  items: { id: string; title: string; views: number; problem?: HeroProblem; status: 'commons' | 'openverse' | 'card' | 'unchanged' | 'failed' | 'would-try'; file?: string; credit?: string; reason?: string; oldMediaId?: string }[]
}

type FetchImage = (m: HeroMedia) => Promise<{ bytes: Buffer; mime: string } | null>

function decodeURIComponentSafe(s: string | undefined): string {
  try {
    return decodeURIComponent(s ?? '')
  } catch {
    return s ?? ''
  }
}

/** The article's current hero and what is wrong with it, or null when it is a fine real photo. Documents are found by name, then by pixels. */
export async function heroProblem(hero: RecentArticle['heroImage'], fetchImage?: FetchImage): Promise<{ problem: HeroProblem | null; reason?: string }> {
  if (!hero || typeof hero !== 'object') return { problem: 'missing' }
  if (hero.isAiGenerated === true || hero.license === 'ai-generated') return { problem: 'ai' }
  // The branded text card (our own design) is not a photo; it is upgraded when a real photo turns up, never flagged as a document
  if (hero.license === 'own' || hero.credit === 'Zaviya') return { problem: 'card' }
  const byName = documentNameReason(hero.filename, hero.alt, decodeURIComponentSafe(hero.credit))
  if (byName) return { problem: 'document', reason: byName }
  const img = fetchImage ? await fetchImage(hero).catch(() => null) : null
  const byPixels = img ? documentPixelReason(img.bytes, img.mime) : null
  return byPixels ? { problem: 'document', reason: byPixels } : { problem: null }
}

/**
 * Stories published in the last `days` days whose hero is an AI image, missing, or a document screenshot get a real photo
 * with the new hero order (Commons, then Openverse); with none found the branded card replaces them. Branded-card heroes
 * are upgraded only when a photo exists. Most viewed first. The old media doc stays in the library (only the article's
 * hero pointer changes), so it is reversible.
 */
export async function backfillRealPhotos(
  payload: PayloadClient,
  opts: {
    days?: number
    dryRun?: boolean
    limit?: number
    find?: (i: HeroInput) => Promise<RealPhoto | null>
    pauseMs?: number
    fetchImage?: FetchImage
    /** Public media base and CDN, for downloading current heroes (document check by pixels) */
    mediaBase?: string
    cdnBase?: string
    card?: typeof uploadBrandCard
  } = {},
): Promise<HeroFixResult> {
  const days = opts.days ?? 7
  const find = opts.find ?? findHeroImage
  const makeCard = opts.card ?? uploadBrandCard
  const fetchImage: FetchImage | undefined =
    opts.fetchImage ??
    (opts.mediaBase
      ? async (m) => {
          const u = absoluteMediaUrl(opts.mediaBase!, m.sizes?.hero?.url ?? m.sizes?.card?.url ?? m.url, opts.cdnBase)
          if (!u) return null
          const r = await fetch(u, { signal: AbortSignal.timeout(30_000) })
          if (!r.ok) return null
          return { bytes: Buffer.from(await r.arrayBuffer()), mime: (r.headers.get('content-type') ?? '').split(';')[0] ?? '' }
        }
      : undefined)
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
    logger.warn({ err: e instanceof Error ? e.message : e }, 'hero fix backfill: no pageview data, newest first')
  }
  const out: HeroFixResult = { scanned: res.docs.length, candidates: 0, replacedCommons: 0, replacedOpenverse: 0, brandedCard: 0, unchanged: 0, failed: 0, noPhoto: [], items: [] }
  const sorted = [...res.docs].sort((a, b) => (views.get(String(b.id)) ?? 0) - (views.get(String(a.id)) ?? 0))
  const todo: { a: RecentArticle; problem: HeroProblem; reason?: string }[] = []
  for (const a of sorted) {
    const p = await heroProblem(a.heroImage, fetchImage)
    if (p.problem) todo.push({ a, problem: p.problem, reason: p.reason })
    else {
      out.unchanged++
      out.items.push({ id: String(a.id), title: a.title ?? '', views: views.get(String(a.id)) ?? 0, status: 'unchanged' })
    }
  }
  const work = todo.slice(0, opts.limit ?? 500)
  out.candidates = work.length
  logger.info({ scanned: out.scanned, candidates: out.candidates, days, dryRun: Boolean(opts.dryRun) }, 'hero fix backfill: scan')
  for (const { a, problem, reason } of work) {
    const id = String(a.id)
    const title = a.title ?? ''
    const old = typeof a.heroImage === 'object' && a.heroImage ? String(a.heroImage.id) : undefined
    const item = { id, title, views: views.get(id) ?? 0, problem, reason, oldMediaId: old }
    if (opts.dryRun) {
      out.items.push({ ...item, status: 'would-try' })
      continue
    }
    try {
      const tags = (a.tags ?? []).map((t) => (typeof t === 'object' ? t.name : undefined)).filter((n): n is string => Boolean(n))
      const real = await find({ title, dek: a.dek, tags })
      if (real) {
        const uploaded = await uploadHeroPhoto(payload, real, title, `article-${id}-photo`)
        await payload.request('PATCH', `/api/articles/${id}?locale=en`, { heroImage: Number(uploaded.id) })
        const kind = heroKindOf(real)
        if (kind === 'openverse') out.replacedOpenverse++
        else out.replacedCommons++
        out.items.push({ ...item, status: kind, file: real.meta.file, credit: real.meta.creditLine })
        logger.info({ articleId: id, newMediaId: uploaded.id, oldMediaId: old, kind, file: real.meta.file }, 'hero fix backfill: hero replaced with a real photo')
      } else {
        out.noPhoto.push(title)
        if (problem === 'card') {
          out.unchanged++
          out.items.push({ ...item, status: 'unchanged' })
        } else {
          const slug = typeof a.category === 'object' && a.category?.slug ? a.category.slug : 'pakistan'
          const card = await makeCard(payload, { title, dek: a.dek, category: slug }, `article-${id}-card`)
          await payload.request('PATCH', `/api/articles/${id}?locale=en`, { heroImage: Number(card.id) })
          out.brandedCard++
          out.items.push({ ...item, status: 'card' })
          logger.info({ articleId: id, newMediaId: card.id, oldMediaId: old, problem }, 'hero fix backfill: no real photo, branded card')
        }
      }
    } catch (e) {
      out.failed++
      out.items.push({ ...item, status: 'failed' })
      logger.warn({ articleId: id, err: e instanceof Error ? e.message : e }, 'hero fix backfill: article failed')
    }
    await new Promise((r) => setTimeout(r, opts.pauseMs ?? 1500))
  }
  logger.info({ scanned: out.scanned, candidates: out.candidates, commons: out.replacedCommons, openverse: out.replacedOpenverse, card: out.brandedCard, unchanged: out.unchanged, failed: out.failed }, 'hero fix backfill: done')
  return out
}
