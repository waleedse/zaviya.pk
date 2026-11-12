import { finalizeCopy } from '../social/hashtags.js'
import { queueArticleQuotes } from '../social/quote-post.js'
import { articleUrl } from '../social/link.js'
import { numbersNotInArticle } from '../social/guards.js'
import { socialIdempotencyKey } from '../lib/idempotency.js'
import { randomUUID } from 'node:crypto'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { PayloadClient } from '../payload-client.js'
import type { WriteResult } from './write.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import { logger } from '../logger.js'
import { publishRank, rankOffsetMs, staleLowDeskStory } from './triage-order.js'
import { capSlotWaitMs, dailyArticleCap, effectiveIntervalMin, QUOTA_EXTRA_PER_DAY } from './triage-rules.js'
import { editorApproved, freshForApproved } from './pitch.js'
import { isTrendGapCluster, isTrendMarked } from '../ingest/trend-gap-mark.js'
import { CARD_VERSION } from './card-version.js'
import { HERO_BACKFILL_JOB, type HeroBackfillData } from './hero-backfill.js'
import { ensureHeroMedia } from './hero-photo.js'

/** Google News / Trends items carry the real outlet in the title ("Headline - Dawn"). */
const HOST_NAMES: Record<string, string> = {
  'arabnews.pk': 'Arab News PK',
  'arabnews.com': 'Arab News',
  'dawn.com': 'Dawn',
  'geo.tv': 'Geo News',
  'thenews.com.pk': 'The News',
  'tribune.com.pk': 'The Express Tribune',
  'brecorder.com': 'Business Recorder',
  'aaj.tv': 'Aaj News',
  'samaa.tv': 'Samaa',
  'tasnimnews.com': 'Tasnim News Agency',
  'reuters.com': 'Reuters',
  'bbc.com': 'BBC',
  'aljazeera.com': 'Al Jazeera',
}

/** The outlet behind an article URL, or null for aggregators (Google News links) and unparsable URLs. */
function outletFromUrl(url: string | undefined): string | null {
  if (!url) return null
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^(www|m|amp)\./, '')
  } catch {
    return null
  }
  if (/(^|\.)google\./.test(host)) return null
  const known = Object.keys(HOST_NAMES).find((h) => host === h || host.endsWith(`.${h}`))
  if (known) return HOST_NAMES[known]!
  const label = host.split('.').filter((p) => p.length > 3 || !['com', 'net', 'org', 'pk', 'co', 'tv'].includes(p))[0]
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : null
}

/**
 * Google News / Trends / extension items carry the real outlet in the title ("Headline - Dawn"); without that suffix
 * the outlet comes from the article URL, so a Trends item never credits "Google Trends" as the source (ZAV-143).
 */
export function publisherName(title: string, feedName: string, url?: string): string {
  if (!/google|discovery|extension/i.test(feedName)) return feedName
  const m = / [-–] ([^-–]{2,40})$/.exec(title.trim())
  if (m) return m[1]!.trim()
  return outletFromUrl(url) ?? feedName.replace(/^Google News — .*/, 'Google News').replace(/^Google Trends — .*/, 'Google Trends')
}

const OUTLETS = 'Dawn|Dawn News|Geo|Geo News|Geo TV|ARY|ARY News|Express Tribune|The Express Tribune|The News|Jang|Samaa|BBC|BBC Urdu|Reuters|AP|AFP|Al Jazeera|Independent Urdu|ProPakistani|Google News|Google Trends'

/** "Dawn: X happened", "X happened, Dawn reports", "X, Dawn headline says" → "X happened" */
export function stripOutletRefs(title: string): string {
  const t = title
    .replace(new RegExp(`^(${OUTLETS})\\s*[:\\-–|]\\s*`, 'i'), '')
    .replace(new RegExp(`[,:\\-–]?\\s*(as\\s+)?(${OUTLETS})('s)?\\s+(reports?|says|said|headline says|headline|story|item)(\\s+today)?\\s*$`, 'i'), '')
    .replace(/\s+[-–|]\s*$/, '')
    .trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : title
}

/** Outlet and aggregator names are sources, not topics: never tags. */
export function cleanTags(tags: string[]): string[] {
  const outlet = new RegExp(`^(${OUTLETS})$`, 'i')
  return tags.filter((t) => t.trim() && !outlet.test(t.trim()))
}

const NOT_A_SOURCE_HOST = /(^|\.)(google\.com|googleusercontent\.com|x\.com|twitter\.com|instagram\.com|facebook\.com|fb\.com|youtube\.com|youtu\.be|tiktok\.com|t\.co)$/i

/** Only an outlet's own pages are sources: Google News redirects and social posts are not (ZAV-56). */
export function isOutletUrl(url: string): boolean {
  try {
    return !NOT_A_SOURCE_HOST.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Sources shown under an article: outlet pages only. If every item is a wrapper, keep them all rather than none. */
export function articleSources<T extends { url: string }>(items: T[]): T[] {
  const own = items.filter((i) => isOutletUrl(i.url))
  return own.length ? own : items
}

/** Social posts found during discovery are embedded (officially supported), never re-hosted. */
export function embedsFromUrls(urls: string[]): { type: 'x' | 'instagram'; url: string }[] {
  const out: { type: 'x' | 'instagram'; url: string }[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    const x = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/.exec(u) ?? /^https?:\/\/x\.com\/i\/web\/status\/(\d+)/.exec(u)
    if (x && !seen.has(x[1]!)) {
      seen.add(x[1]!)
      out.push({ type: 'x', url: `https://x.com/i/web/status/${x[1]}` })
      continue
    }
    const ig = /^https?:\/\/(?:www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/.exec(u)
    if (ig && !seen.has(ig[2]!)) {
      seen.add(ig[2]!)
      out.push({ type: 'instagram', url: `https://www.instagram.com/${ig[1]}/${ig[2]}/` })
    }
  }
  return out.slice(0, 3)
}

/** Shortest English body that may go live: an empty or stub body must stay a draft (ZAV-90). */
export const MIN_BODY_WORDS = 80

/** Why this written story must not be published, or null when it is fine. */
export function publishBlocker(write: { en: { bodyMarkdown?: string; whatItMeans?: string } }): string | null {
  const words = (write.en.bodyMarkdown ?? '').trim().split(/\s+/).filter(Boolean).length
  if (words < MIN_BODY_WORDS) return `empty or short body (${words} words)`
  if (!(write.en.whatItMeans ?? '').trim()) return 'empty whatItMeans'
  return null
}

/**
 * Publish slot lock. The pacing check (articlesPublishedToday / lastPublishedAt) and the publish itself are
 * check-then-act: jobs waking in the same second all saw a free slot (10-11 Nov: two stories in one second,
 * over the overnight allowance). Only the holder of this short lock may check the pace and publish.
 */
export const PUBLISH_SLOT_KEY = 'publish:slot'
const PUBLISH_SLOT_TTL_MS = 30_000

/** Returns a release token, or null when another job holds the slot. waitMs > 0 retries for that long. */
export async function acquirePublishSlot(redis: Pick<Redis, 'set'>, waitMs = 0): Promise<string | null> {
  const token = randomUUID()
  const until = Date.now() + waitMs
  for (;;) {
    const ok = await redis.set(PUBLISH_SLOT_KEY, token, 'PX', PUBLISH_SLOT_TTL_MS, 'NX').catch(() => 'OK')  // Redis trouble must not stop publishing
    if (ok === 'OK') return token
    if (Date.now() >= until) return null
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** Delete the lock only if we still own it (it may have expired and been taken by another job). */
export async function releasePublishSlot(redis: Pick<Redis, 'eval'>, token: string): Promise<void> {
  await redis
    .eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, PUBLISH_SLOT_KEY, token)
    .catch(() => undefined)
}

/** Redis hash of stories waiting for the editor: articleId → publish job data */
export const GATE_KEY = 'zaviya:gate'

/**
 * A rejected gate draft must not kill the story (ZAV-54). If the cluster already has a live article the
 * cluster keeps pointing at it (the draft had overwritten the link); otherwise it goes back to triaged
 * so a corrected draft can be written.
 */
export async function releaseRejectedDraft(clusterId: string, payload: Pick<PayloadClient, 'request' | 'patchCluster'>): Promise<'kept-live' | 'triaged'> {
  const live = await payload.request<{ docs: { id: string | number }[] }>(
    'GET',
    `/api/articles?where[storyCluster][equals]=${clusterId}&where[_status][equals]=published&sort=-publishedAt&limit=1&depth=0`,
  )
  const liveId = live.docs[0]?.id
  if (liveId !== undefined) {
    await payload.patchCluster(clusterId, { article: String(liveId) })
    return 'kept-live'
  }
  await payload.patchCluster(clusterId, { status: 'triaged' })
  return 'triaged'
}

/**
 * A draft still marked in_review whose Redis entry is gone (an earlier approve consumed it and the publish
 * was blocked, or Redis was flushed) can never be finished, yet stays on the editor's list and swallows every
 * later command (ZAV-177). Move it out of review so the editor stops seeing it; the text stays as a draft.
 */
export async function dropOrphanedGateDraft(articleId: string, payload: Pick<PayloadClient, 'request'>): Promise<boolean> {
  try {
    const a = await payload.request<{ _status?: string; workflow?: string }>('GET', `/api/articles/${articleId}?draft=true&depth=0`)
    if (a._status !== 'draft' || a.workflow !== 'in_review') return false
    await payload.request('PATCH', `/api/articles/${articleId}?draft=true&locale=en`, { workflow: 'draft' })
    logger.warn({ articleId }, 'gate draft had no waiting entry: moved out of review')
    return true
  } catch (e) {
    logger.warn({ err: e, articleId }, 'could not clear an orphaned gate draft')
    return false
  }
}

/** Publish (or drop) a story the editor decided on. Publishing reuses the normal path with its article id. */
export async function finishGated(
  articleId: string,
  action: 'publish' | 'reject',
  deps: { payload: PayloadClient; socialQueue: Queue; redis: Redis; mediaQueue?: Queue; slotHeld?: boolean },
): Promise<boolean> {
  const raw = await deps.redis.hget(GATE_KEY, articleId)
  if (!raw) {
    await dropOrphanedGateDraft(articleId, deps.payload)
    return false
  }
  // Take the publish slot for the cap check and the publish, so it cannot race another publish job (breaking is exempt)
  let token: string | null = null
  if (action === 'publish' && !deps.slotHeld && (JSON.parse(raw) as { priority?: string }).priority !== 'breaking') {
    token = await acquirePublishSlot(deps.redis, 5_000)
    if (!token) {
      logger.info({ articleId }, 'editor approved, but another story is publishing: the story keeps waiting')
      return true
    }
  }
  try {
    return await finishGatedLocked(articleId, action, raw, deps)
  } finally {
    if (token) await releasePublishSlot(deps.redis, token)
  }
}

async function finishGatedLocked(
  articleId: string,
  action: 'publish' | 'reject',
  raw: string,
  deps: { payload: PayloadClient; socialQueue: Queue; redis: Redis; mediaQueue?: Queue },
): Promise<boolean> {
  // Daily cap (5 Nov): an approved story waits in the gate instead of going out over the cap.
  const gated = JSON.parse(raw) as { priority?: string; triage?: { trendGap?: boolean } }
  if (action === 'publish' && gated.priority !== 'breaking' && (await dailyCapReached(deps.payload, Date.now(), Boolean(gated.triage?.trendGap)).catch(() => false))) {
    logger.info({ articleId }, 'editor approved, but the daily cap is reached: the story keeps waiting')
    return true
  }
  await deps.redis.hdel(GATE_KEY, articleId)
  const data = JSON.parse(raw) as Parameters<typeof processPublishJob>[0]
  if (action === 'reject') {
    const outcome = await releaseRejectedDraft(data.clusterId, deps.payload).catch(() => undefined)
    logger.info({ articleId, outcome }, 'editor rejected the story')
    return true
  }
  // Approved text draft: make its image and cards now; the media step then publishes it
  if (!data.heroMediaId && deps.mediaQueue) {
    await deps.mediaQueue.add(
      'media',
      { clusterId: data.clusterId, write: data.write, qaScore: data.qaScore, priority: data.priority, articleId },
      { priority: 1 },
    )
    logger.info({ articleId }, 'editor approved: making the image, then publishing')
    return true
  }
  await processPublishJob({ ...data, articleId }, { payload: deps.payload, socialQueue: deps.socialQueue, mediaQueue: deps.mediaQueue, slotHeld: true })
  return true
}

/** Gate fallback: when nothing went out for `minutes`, publish the oldest waiting story (editor down or slow). */
export async function gateFallback(deps: { payload: PayloadClient; socialQueue: Queue; redis: Redis; mediaQueue?: Queue }, minutes: number): Promise<void> {
  const waiting = await deps.redis.hgetall(GATE_KEY)
  const ids = Object.keys(waiting)
  if (!ids.length) return
  const token = await acquirePublishSlot(deps.redis)
  if (!token) return
  try {
    await gateFallbackLocked(deps, minutes, waiting, ids)
  } finally {
    await releasePublishSlot(deps.redis, token)
  }
}

async function gateFallbackLocked(
  deps: { payload: PayloadClient; socialQueue: Queue; redis: Redis; mediaQueue?: Queue },
  minutes: number,
  waiting: Record<string, string>,
  ids: string[],
): Promise<void> {
  if (await dailyCapReached(deps.payload).catch(() => false)) return
  const settings = await deps.payload.getSettings()
  const last = settings.lastPublishedAt ? Date.parse(settings.lastPublishedAt) : 0
  if (Date.now() - last < minutes * 60_000) return
  const oldest = ids.sort((a, b) => (JSON.parse(waiting[a]!).waitingSince ?? 0) - (JSON.parse(waiting[b]!).waitingSince ?? 0))[0]!
  logger.warn({ articleId: oldest, minutes }, 'editor gate fallback: publishing the oldest waiting story')
  await finishGated(oldest, 'publish', { ...deps, slotHeld: true })
}

/** Categories that must publish at least once every 4 hours (Waleed, 13 Oct). AI dropped on 5 Nov: foreign tech rewrites do not earn a cap bypass. */
export const QUOTA_CATEGORIES: string[] = ['education-jobs']
const QUOTA_WINDOW_MS = 4 * 60 * 60_000

export async function categoryOverdue(payload: PayloadClient, category: string, now = Date.now()): Promise<boolean> {
  const res = await payload.request<{ docs: { publishedAt?: string }[] }>(
    'GET',
    `/api/articles?where[_status][equals]=published&where[category.slug][equals]=${category}&sort=-publishedAt&limit=1&depth=0`,
  )
  const last = res.docs[0]?.publishedAt ? Date.parse(res.docs[0].publishedAt) : 0
  return now - last > QUOTA_WINDOW_MS
}

/** No slot for a normal story right now: the day's pace (Settings.dailyCaps.articles, else DEFAULT_DAILY_ARTICLE_CAP) is used up. */
export async function dailyCapReached(payload: Pick<PayloadClient, 'getSettings'>, now = Date.now(), extraSlots = false): Promise<boolean> {
  const settings = await payload.getSettings()
  // Trend-gap and overdue-desk stories may use the extra slots: only the hard cap plus QUOTA_EXTRA_PER_DAY stops them
  if (extraSlots) return (settings.articlesPublishedToday ?? 0) >= dailyArticleCap(settings) + QUOTA_EXTRA_PER_DAY
  return capSlotWaitMs(settings.articlesPublishedToday ?? 0, dailyArticleCap(settings), new Date(now)) > 0
}

/**
 * How long a normal story must wait for its publishing slot (min interval and the daily pace from Settings).
 * quotaOverdue (the 4 h desk): skips the schedule but not the hard cap plus QUOTA_EXTRA_PER_DAY, nor the interval.
 */
export async function pacingWaitMs(payload: PayloadClient, now = Date.now(), quotaOverdue = false): Promise<number> {
  const settings = await payload.getSettings()
  // Never slower than one story every MAX_PUBLISH_INTERVAL_MIN minutes (10 since ZAV-201, was 15)
  const minIntervalMs = effectiveIntervalMin(settings) * 60_000
  const published = settings.articlesPublishedToday ?? 0
  const cap = dailyArticleCap(settings)
  if (quotaOverdue) {
    if (published >= cap + QUOTA_EXTRA_PER_DAY) return 60 * 60_000
  } else {
    const slot = capSlotWaitMs(published, cap, new Date(now))
    if (slot > 0) return slot + Math.floor(Math.random() * 90_000)
  }
  const last = settings.lastPublishedAt ? Date.parse(settings.lastPublishedAt) : 0
  const gap = now - last
  // A little jitter so several waiting stories do not all wake at the same second
  return gap >= minIntervalMs ? 0 : minIntervalMs - gap + Math.floor(Math.random() * 90_000)
}

/** Redis key of a story's Urdu headline, read by the video service */
export const storyUrKey = (articleId: string) => `story:ur:${articleId}`  // same key as video/explainer/script-job.ts

export type PublishJobData = {
    clusterId: string
    write: WriteResult
    heroMediaId?: string
    socialMediaUrls?: string[]
    qaScore: number
    priority: Priority
    triage?: TriageResult
    articleId?: string
    /** The hero is the branded card, not an illustration: queue a backfill that swaps in the Gemini image later (ZAV-299) */
    heroFallback?: boolean
    /** CARD_VERSION the social cards were made under; missing = made before versioning, so they are remade */
    cardVersion?: number
}
type PublishDeps = {
  /** Remakes social cards made under older card rules (media.ts rerenderStaleCards); null keeps the old ones */
  rerenderCards?: (input: { clusterId: string; write: WriteResult; category: string; priority: Priority }) => Promise<string[] | null>
  payload: PayloadClient; socialQueue: Queue; publishQueue?: Queue; mediaQueue?: Pick<Queue, 'add'>; gate?: { redis: Redis }; redis?: Redis; slotHeld?: boolean }

export async function processPublishJob(data: PublishJobData, deps: PublishDeps): Promise<{ articleId: string } | null> {
  const slot: { token: string | null } = { token: null }
  try {
    return await publishJob(data, deps, slot)
  } finally {
    const kv = deps.redis ?? deps.gate?.redis
    if (slot.token && kv) await releasePublishSlot(kv, slot.token)
  }
}

async function publishJob(data: PublishJobData, deps: PublishDeps, slot: { token: string | null }): Promise<{ articleId: string } | null> {
  const cluster = await deps.payload.getCluster(data.clusterId)
  const triage = data.triage ?? (cluster.triage as TriageResult | undefined)

  // Never publish an empty or stub article (ZAV-90): it stays a draft and the cluster goes back to triaged.
  const blocker = triage?.isUpdateOfExisting ? null : publishBlocker(data.write)
  if (blocker) {
    logger.warn({ clusterId: data.clusterId, articleId: data.articleId, blocker }, 'publish blocked: article text is incomplete')
    await deps.payload.patchCluster(data.clusterId, { status: 'triaged' }).catch(() => undefined)
    return null
  }

  // Stale story (ZAV-89): newest source older than 18h means no publish; the cluster is rejected with the reason.
  if (!triage?.isUpdateOfExisting && cluster.items.length && !freshForApproved(cluster.items, { ...(cluster.triage as object | undefined), ...(triage as object | undefined) })) {
    logger.warn({ clusterId: data.clusterId, articleId: data.articleId }, 'publish blocked: stale sources')
    await deps.payload.patchCluster(data.clusterId, { status: 'rejected', triage: { ...(triage ?? {}), deferReason: 'stale sources' } }).catch(() => undefined)
    return null
  }

  // Editor gate: normal stories wait as drafts (workflow in_review); the editor agent publishes the
  // best one each run. Breaking stories and live updates still go out at once.
  // A story the editor approved as a pitch was chosen before it was written: it does not wait twice.
  const gatedByRule = Boolean(deps.gate) && !data.articleId && data.priority !== 'breaking' && !triage?.isUpdateOfExisting && !editorApproved(triage)

  // ZG-22: the 40-a-day cap stays; what goes into it is chosen. Waiting stories wake best-first (trend hit, learned desk weight,
  // freshness), and a story that waited past 12 h on a 0.6 desk with no trend hit leaves the queue as an editor draft (nothing is deleted).
  const rankSettings = await deps.payload.getSettings().catch(() => ({}) as { categoryWeights?: Record<string, number> })
  const rankInput = { category: triage?.category, trend: isTrendMarked(cluster.items) || Boolean((triage as { trendGap?: boolean } | undefined)?.trendGap), items: cluster.items }
  const rankOffset = rankOffsetMs(publishRank(rankInput, { weights: rankSettings.categoryWeights }))
  const droppedAsDraft =
    !gatedByRule && Boolean(deps.gate) && !data.articleId && data.priority !== 'breaking' && !triage?.isUpdateOfExisting &&
    staleLowDeskStory(rankInput, { weights: rankSettings.categoryWeights })
  if (droppedAsDraft) logger.info({ clusterId: data.clusterId, category: triage?.category }, 'publish queue: older than 12 h on a 0.6 desk, no trend hit: kept as a draft for the editor')
  const gated = gatedByRule || droppedAsDraft

  // Pacing is enforced here, at the last step: triage runs in parallel and cannot see the
  // stories still being written, so on 12 Oct 236 non-breaking stories went out against a cap of 96.
  // AI and jobs must get a story at least every 4 hours: those skip the 15-minute queue when overdue.
  // A trend-gap story (ZG-21) uses the same extra slots as an overdue desk: it is never held back by the daily pace
  const overdueCategory = isTrendGapCluster(cluster.items) || Boolean((triage as { trendGap?: boolean } | undefined)?.trendGap) || Boolean(triage?.category && QUOTA_CATEGORIES.includes(triage.category)
    ? await categoryOverdue(deps.payload, triage.category).catch(() => false)
    : false)
  // Only the holder of the publish slot may check the pace and publish; the others come back in 30-90 s (breaking and live updates are exempt).
  const slotKv = deps.redis ?? deps.gate?.redis
  if (!gated && deps.publishQueue && slotKv && !deps.slotHeld && data.priority !== 'breaking' && !triage?.isUpdateOfExisting) {
    slot.token = await acquirePublishSlot(slotKv)
    if (!slot.token) {
      await deps.publishQueue.add('publish', data, { delay: 30_000 + Math.floor(Math.random() * 60_000), priority: 5 })
      logger.info({ clusterId: data.clusterId, articleId: data.articleId }, 'publish slot busy: another story is publishing, retrying shortly')
      return null
    }
    // An approved draft skips the pacing below but not the daily cap (the cap was checked when it was approved, maybe hours ago)
    if (data.articleId) {
      const capWait = await dailyCapReached(deps.payload, Date.now(), overdueCategory).catch(() => false)
      if (capWait) {
        await deps.publishQueue.add('publish', data, { delay: 5 * 60_000 + Math.floor(Math.random() * 90_000) + rankOffset, priority: 5 })
        logger.info({ clusterId: data.clusterId, articleId: data.articleId }, 'approved story waits: the daily cap is reached')
        return null
      }
    }
  }
  if (!gated && deps.publishQueue && !data.articleId && data.priority !== 'breaking' && !triage?.isUpdateOfExisting) {
    const wait = await pacingWaitMs(deps.payload, Date.now(), overdueCategory).catch(() => 0)
    if (wait > 0) {
      await deps.publishQueue.add('publish', data, { delay: wait + rankOffset, priority: 5 })
      logger.info({ clusterId: data.clusterId, waitMin: Math.round(wait / 60_000) }, 'publish paced: waiting for the next slot')
      return null
    }
  }

  if (triage?.isUpdateOfExisting && triage.existingArticleId) {
    await deps.payload.postLiveUpdate(triage.existingArticleId, {
      at: new Date().toISOString(),
      text: { en: data.write.en.keyPoints[0], ...(data.write.ur ? { ur: data.write.ur!.keyPoints[0] } : {}) },
    })
    await deps.payload.patchCluster(data.clusterId, { status: 'updated' })
    return { articleId: triage.existingArticleId }
  }

  const category = triage?.category ?? 'pakistan'
  const sources = articleSources(cluster.items).map((i) => ({
    name: publisherName(i.title, i.source.name, i.url),
    url: i.url,
    tier: i.source.trustTier,
    publishedAt: i.publishedAt,
  }))

  const embeds = embedsFromUrls(cluster.items.map((i) => i.url))

  // Publish guard: a live article always has a hero (real photo of the subject, real photo of the topic, else the branded card).
  // The media step normally did this; this catches every path that arrives without one (retries, approved drafts, manual releases).
  let heroMediaId = data.heroMediaId
  let heroFallback = Boolean(data.heroFallback)
  if (!gated && !heroMediaId) {
    const hero = await ensureHeroMedia(deps.payload, {
      title: data.write.en.title,
      dek: data.write.en.dek,
      brief: data.write.en.imageBrief || data.write.en.title,
      tags: data.write.en.tags,
      category,
      slug: data.write.en.slug,
      breaking: data.priority === 'breaking',
    }).catch(() => null)
    if (hero) {
      heroMediaId = hero.id
      if (hero.kind === 'card') heroFallback = true
      logger.warn({ clusterId: data.clusterId, kind: hero.kind, mediaId: hero.id }, 'publish guard: story had no hero, made one')
    } else {
      logger.error({ clusterId: data.clusterId, title: data.write.en.title }, 'publish guard: no hero could be made, publishing without one (the backfill will fix it)')
    }
  }

  let res: { id: string }
  try {
    res = await deps.payload.postArticle({
      articleId: data.articleId,
      clusterId: data.clusterId,
      category,
      priority: data.priority,
      isBreaking: data.priority === 'breaking',
      status: gated ? 'in_review' : 'published',
      heroMediaId,
      sources,
      embeds,
      ai: {
        model: data.write.models ? `en=${data.write.models.en}${data.write.models.ur ? ` ur=${data.write.models.ur}` : ''}` : 'unknown',
        promptVersion: data.write.ur ? `${data.write.promptVersions.en}+${data.write.promptVersions.ur}` : data.write.promptVersions.en,
        qaScore: data.qaScore,
        generatedAt: new Date().toISOString(),
      },
      locales: {
        en: {
          title: stripOutletRefs(data.write.en.title),
          titleVariants: data.write.en.titleOptions.filter((t) => t !== data.write.en.title).map(stripOutletRefs),
          slug: data.write.en.slug,
          dek: data.write.en.dek,
          keyPoints: data.write.en.keyPoints,
          bodyMarkdown: data.write.en.bodyMarkdown,
          whatItMeans: data.write.en.whatItMeans,
          faqs: data.write.en.faqs,
          tags: cleanTags(data.write.en.tags),
          metaDescription: data.write.en.metaDescription,
          altText: data.write.en.altText,
        },
        ...(data.write.ur ? { ur: {
          title: data.write.ur!.title,
          titleVariants: data.write.ur!.titleOptions.filter((t) => t !== data.write.ur!.title),
          slug: data.write.ur!.slug,
          dek: data.write.ur!.dek,
          keyPoints: data.write.ur!.keyPoints,
          bodyMarkdown: data.write.ur!.bodyMarkdown,
          whatItMeans: data.write.ur!.whatItMeans,
          faqs: data.write.ur!.faqs,
          tags: cleanTags(data.write.ur!.tags),
          metaDescription: data.write.ur!.metaDescription,
          altText: data.write.ur!.altText,
        } } : {}),
      },
    })
  } catch (e) {
    logger.warn({ err: e }, 'publish failed')
    return null
  }

  if (gated && deps.gate) {
    // Keep everything needed to finish publishing once the editor approves (or the fallback fires)
    await deps.gate.redis.hset(GATE_KEY, String(res.id), JSON.stringify({ ...data, articleId: String(res.id), waitingSince: Date.now() }))
    await deps.payload.patchCluster(data.clusterId, { status: 'in_review', article: res.id })
    logger.info({ clusterId: data.clusterId, articleId: res.id, title: data.write.en.title }, 'waiting for the editor')
    return { articleId: String(res.id) }
  }

  await deps.payload.patchCluster(data.clusterId, { status: 'published', article: res.id })
  logger.info({ clusterId: data.clusterId, articleId: res.id, title: data.write.en.title, hero: Boolean(heroMediaId), heroFallback }, 'published')

  // Published with the branded card: the story stays online, the real hero replaces the card in place (same article and slug)
  if (heroFallback && deps.mediaQueue) {
    await deps.mediaQueue
      .add(
        HERO_BACKFILL_JOB,
        {
          articleId: String(res.id),
          title: data.write.en.title,
          brief: data.write.en.imageBrief || data.write.en.title,
          sourceUrls: cluster.items.map((i) => i.url),
          dek: data.write.en.dek,
          tags: data.write.en.tags,
        } satisfies HeroBackfillData,
        { priority: 7, delay: 15 * 60_000 },
      )
      .catch((e) => logger.warn({ err: e, articleId: res.id }, 'hero backfill not queued'))
  }

  // The Urdu headline the writer made for the social card is the voice line of the voiced news video (the site stores no Urdu title)
  const headlineUr = data.write.en.card?.headlineUr?.trim()
  const kv = deps.redis ?? deps.gate?.redis
  if (headlineUr && kv) await kv.set(storyUrKey(String(res.id)), JSON.stringify({ headlineUr }), 'EX', 7 * 86400).catch(() => undefined)

  // Paced stories wait hours or days: cards made under older card rules (wrong photo, 'AI image' label) are made again
  let socialMediaUrls = data.socialMediaUrls ?? []
  if (deps.rerenderCards && socialMediaUrls.length && (data.cardVersion ?? 0) < CARD_VERSION) {
    const fresh = await deps
      .rerenderCards({ clusterId: data.clusterId, write: data.write, category, priority: data.priority })
      .catch((e) => (logger.warn({ err: e, articleId: res.id }, 'stale cards not remade'), null))
    if (fresh) {
      logger.info({ articleId: res.id, from: data.cardVersion ?? 0, to: CARD_VERSION }, 'stale social cards remade at publish')
      socialMediaUrls = fresh
    }
  }

  const platforms = ['facebook', 'instagram', 'x'] as const
  // Social copy may not change a figure (ZAV-120): hold a platform's post when it states a number the article does not
  const articleText = [
    data.write.en.title,
    data.write.en.dek,
    data.write.en.metaDescription ?? '',
    ...(data.write.en.titleOptions ?? []),
    ...data.write.en.keyPoints,
    data.write.en.bodyMarkdown,
    data.write.en.whatItMeans,
    ...(data.write.en.faqs ?? []).flatMap((f) => [f.q, f.a]),
    data.write.en.card?.figure ? `${data.write.en.card.figure.value} ${data.write.en.card.figure.label}` : '',
  ].join('\n')
  for (let i = 0; i < platforms.length; i++) {
    const wrong = numbersNotInArticle(data.write.en.socialCopy[platforms[i]!], articleText)
    if (wrong.length) {
      logger.warn({ articleId: res.id, platform: platforms[i], wrong }, 'social copy held: number mismatch')
      await deps.payload
        .upsertSocialPost({
          idempotencyKey: socialIdempotencyKey(String(res.id), platforms[i]!, 'text'),
          article: String(res.id),
          platform: platforms[i]!,
          format: 'text',
          copy: data.write.en.socialCopy[platforms[i]!],
          mediaUrls: [],
          status: 'failed',
          error: `number mismatch: ${wrong.join(', ')}`,
        })
        .catch((e) => logger.warn({ err: e }, 'could not record the held social post'))
      continue
    }
    await deps.socialQueue.add(
      `social-${platforms[i]}`,
      {
        articleId: res.id,
        platform: platforms[i],
        priority: data.priority,
        copy: finalizeCopy(data.write.en.socialCopy, { tags: cleanTags(data.write.en.tags), category, title: data.write.en.title }),
        title: data.write.en.title,
        clusterId: data.clusterId,
        mediaUrls: socialMediaUrls,
        url: articleUrl(category, data.write.en.slug),
      },
      {
        // Posted the moment the article goes live (breaking included); the social worker is serial, so the three go one after another
        // Within a peak window the better stories go first (newsworthiness 0..1 maps to priority 2..9), so the daily cap keeps the best (ZAV-115)
        priority: data.priority === 'breaking' ? 1 : 2 + Math.round((1 - (triage?.newsworthiness ?? 0.5)) * 7),
      },
    )
  }

  // Direct quotes in the sources become quote-card candidates (social/quote-post.ts picks one per round)
  if (kv && process.env.QUOTE_CARDS !== '0') await queueArticleQuotes(kv, cluster.items, { category, slug: data.write.en.slug })

  return { articleId: res.id }
}
