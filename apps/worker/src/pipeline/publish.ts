import { articleUrl } from '../social/link.js'
import { numbersNotInArticle } from '../social/guards.js'
import { socialIdempotencyKey } from '../lib/idempotency.js'
import type { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { PayloadClient } from '../payload-client.js'
import type { WriteResult } from './write.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import { logger } from '../logger.js'
import { editorApproved, hasFreshSource } from './pitch.js'

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
  deps: { payload: PayloadClient; socialQueue: Queue; redis: Redis; mediaQueue?: Queue },
): Promise<boolean> {
  const raw = await deps.redis.hget(GATE_KEY, articleId)
  if (!raw) {
    await dropOrphanedGateDraft(articleId, deps.payload)
    return false
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
  await processPublishJob({ ...data, articleId }, { payload: deps.payload, socialQueue: deps.socialQueue })
  return true
}

/** Gate fallback: when nothing went out for `minutes`, publish the oldest waiting story (editor down or slow). */
export async function gateFallback(deps: { payload: PayloadClient; socialQueue: Queue; redis: Redis; mediaQueue?: Queue }, minutes: number): Promise<void> {
  const waiting = await deps.redis.hgetall(GATE_KEY)
  const ids = Object.keys(waiting)
  if (!ids.length) return
  const settings = await deps.payload.getSettings()
  const last = settings.lastPublishedAt ? Date.parse(settings.lastPublishedAt) : 0
  if (Date.now() - last < minutes * 60_000) return
  const oldest = ids.sort((a, b) => (JSON.parse(waiting[a]!).waitingSince ?? 0) - (JSON.parse(waiting[b]!).waitingSince ?? 0))[0]!
  logger.warn({ articleId: oldest, minutes }, 'editor gate fallback: publishing the oldest waiting story')
  await finishGated(oldest, 'publish', deps)
}

/** Categories that must publish at least once every 4 hours (Waleed, 13 Oct) */
export const QUOTA_CATEGORIES: string[] = ['ai', 'education-jobs']
const QUOTA_WINDOW_MS = 4 * 60 * 60_000

async function categoryOverdue(payload: PayloadClient, category: string, now = Date.now()): Promise<boolean> {
  const res = await payload.request<{ docs: { publishedAt?: string }[] }>(
    'GET',
    `/api/articles?where[_status][equals]=published&where[category.slug][equals]=${category}&sort=-publishedAt&limit=1&depth=0`,
  )
  const last = res.docs[0]?.publishedAt ? Date.parse(res.docs[0].publishedAt) : 0
  return now - last > QUOTA_WINDOW_MS
}

/** How long a normal story must wait for its publishing slot (min interval and daily cap from Settings). */
export async function pacingWaitMs(payload: PayloadClient, now = Date.now()): Promise<number> {
  const settings = await payload.getSettings()
  // Never slower than one story every 15 minutes: 4 an hour is the floor (Waleed, 16 Oct)
  const minIntervalMs = Math.min(settings.minIntervalMin ?? 15, 15) * 60_000
  const cap = settings.dailyCaps?.articles ?? 96
  if ((settings.articlesPublishedToday ?? 0) >= cap) return 60 * 60_000
  const last = settings.lastPublishedAt ? Date.parse(settings.lastPublishedAt) : 0
  const gap = now - last
  // A little jitter so several waiting stories do not all wake at the same second
  return gap >= minIntervalMs ? 0 : minIntervalMs - gap + Math.floor(Math.random() * 90_000)
}

export async function processPublishJob(
  data: {
    clusterId: string
    write: WriteResult
    heroMediaId?: string
    socialMediaUrls?: string[]
    qaScore: number
    priority: Priority
    triage?: TriageResult
    articleId?: string
  },
  deps: { payload: PayloadClient; socialQueue: Queue; publishQueue?: Queue; gate?: { redis: Redis } },
): Promise<{ articleId: string } | null> {
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
  if (!triage?.isUpdateOfExisting && cluster.items.length && !hasFreshSource(cluster.items)) {
    logger.warn({ clusterId: data.clusterId, articleId: data.articleId }, 'publish blocked: stale sources')
    await deps.payload.patchCluster(data.clusterId, { status: 'rejected', triage: { ...(triage ?? {}), deferReason: 'stale sources' } }).catch(() => undefined)
    return null
  }

  // Editor gate: normal stories wait as drafts (workflow in_review); the editor agent publishes the
  // best one each run. Breaking stories and live updates still go out at once.
  // A story the editor approved as a pitch was chosen before it was written: it does not wait twice.
  const gated = Boolean(deps.gate) && !data.articleId && data.priority !== 'breaking' && !triage?.isUpdateOfExisting && !editorApproved(triage)

  // Pacing is enforced here, at the last step: triage runs in parallel and cannot see the
  // stories still being written, so on 12 Oct 236 non-breaking stories went out against a cap of 96.
  // AI and jobs must get a story at least every 4 hours: those skip the 15-minute queue when overdue.
  const overdueCategory = triage?.category && QUOTA_CATEGORIES.includes(triage.category)
    ? await categoryOverdue(deps.payload, triage.category).catch(() => false)
    : false
  if (!gated && deps.publishQueue && !data.articleId && data.priority !== 'breaking' && !triage?.isUpdateOfExisting && !overdueCategory) {
    const wait = await pacingWaitMs(deps.payload).catch(() => 0)
    if (wait > 0) {
      await deps.publishQueue.add('publish', data, { delay: wait, priority: 5 })
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

  let res: { id: string }
  try {
    res = await deps.payload.postArticle({
      articleId: data.articleId,
      clusterId: data.clusterId,
      category,
      priority: data.priority,
      isBreaking: data.priority === 'breaking',
      status: gated ? 'in_review' : 'published',
      heroMediaId: data.heroMediaId,
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
  logger.info({ clusterId: data.clusterId, articleId: res.id, title: data.write.en.title, hero: Boolean(data.heroMediaId) }, 'published')

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
        copy: data.write.en.socialCopy,
        title: data.write.en.title,
        clusterId: data.clusterId,
        mediaUrls: data.socialMediaUrls ?? [],
        url: articleUrl(category, data.write.en.slug),
      },
      {
        // Posted the moment the article goes live (breaking included); the social worker is serial, so the three go one after another
        // Within a peak window the better stories go first (newsworthiness 0..1 maps to priority 2..9), so the daily cap keeps the best (ZAV-115)
        priority: data.priority === 'breaking' ? 1 : 2 + Math.round((1 - (triage?.newsworthiness ?? 0.5)) * 7),
      },
    )
  }

  return { articleId: res.id }
}
