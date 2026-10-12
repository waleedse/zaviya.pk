import type { Queue } from 'bullmq'
import type { PayloadClient } from '../payload-client.js'
import type { WriteResult } from './write.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import { logger } from '../logger.js'
import { SITE } from '@zaviya/shared'

function nextSocialSlots(now = new Date(), count = 3): Date[] {
  const slots: Date[] = []
  const pktHours = [
    { h: 8, m: 30 },
    { h: 9, m: 30 },
    { h: 13, m: 30 },
    { h: 20, m: 30 },
    { h: 22, m: 0 },
  ]
  for (let day = 0; day < 2 && slots.length < count; day++) {
    for (const { h, m } of pktHours) {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() + day)
      const pkt = new Date(d.toLocaleString('en-US', { timeZone: SITE.timezone }))
      pkt.setHours(h, m, 0, 0)
      if (pkt > now) slots.push(pkt)
    }
  }
  return slots.slice(0, count)
}

/** Google News / Trends items carry the real outlet in the title ("Headline - Dawn"). */
export function publisherName(title: string, feedName: string): string {
  if (!/google|discovery|extension/i.test(feedName)) return feedName
  const m = / [-–] ([^-–]{2,40})$/.exec(title.trim())
  return m ? m[1]!.trim() : feedName.replace(/^Google News — .*/, 'Google News')
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

/** How long a normal story must wait for its publishing slot (min interval and daily cap from Settings). */
export async function pacingWaitMs(payload: PayloadClient, now = Date.now()): Promise<number> {
  const settings = await payload.getSettings()
  const minIntervalMs = (settings.minIntervalMin ?? 15) * 60_000
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
  deps: { payload: PayloadClient; socialQueue: Queue; publishQueue?: Queue },
): Promise<{ articleId: string } | null> {
  const cluster = await deps.payload.getCluster(data.clusterId)
  const triage = data.triage ?? (cluster.triage as TriageResult | undefined)

  // Pacing is enforced here, at the last step: triage runs in parallel and cannot see the
  // stories still being written, so on 12 Oct 236 non-breaking stories went out against a cap of 96.
  if (deps.publishQueue && !data.articleId && data.priority !== 'breaking' && !triage?.isUpdateOfExisting) {
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
  const sources = cluster.items.map((i) => ({
    name: publisherName(i.title, i.source.name),
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
      status: 'published',
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

  await deps.payload.patchCluster(data.clusterId, { status: 'published', article: res.id })
  logger.info({ clusterId: data.clusterId, articleId: res.id, title: data.write.en.title, hero: Boolean(data.heroMediaId) }, 'published')

  const slots = nextSocialSlots()
  const platforms = ['facebook', 'instagram', 'x'] as const
  for (let i = 0; i < platforms.length; i++) {
    await deps.socialQueue.add(
      `social-${platforms[i]}`,
      {
        articleId: res.id,
        platform: platforms[i],
        priority: data.priority,
        copy: data.write.en.socialCopy,
        mediaUrls: data.socialMediaUrls ?? [],
      },
      {
        delay: Math.max(0, (slots[i]?.getTime() ?? Date.now()) - Date.now()),
        priority: data.priority === 'breaking' ? 1 : 5,
      },
    )
  }

  return { articleId: res.id }
}
