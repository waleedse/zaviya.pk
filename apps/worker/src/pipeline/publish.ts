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
  deps: { payload: PayloadClient; socialQueue: Queue },
): Promise<{ articleId: string } | null> {
  const cluster = await deps.payload.getCluster(data.clusterId)
  const triage = data.triage ?? (cluster.triage as TriageResult | undefined)

  if (triage?.isUpdateOfExisting && triage.existingArticleId) {
    await deps.payload.postLiveUpdate(triage.existingArticleId, {
      at: new Date().toISOString(),
      text: { en: data.write.en.keyPoints[0], ur: data.write.ur.keyPoints[0] },
    })
    await deps.payload.patchCluster(data.clusterId, { status: 'updated' })
    return { articleId: triage.existingArticleId }
  }

  const category = triage?.category ?? 'pakistan'
  const sources = cluster.items.map((i) => ({
    name: i.source.name,
    url: i.url,
    tier: i.source.trustTier,
    publishedAt: i.publishedAt,
  }))

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
      ai: {
        model: 'router',
        promptVersion: `${data.write.promptVersions.en}+${data.write.promptVersions.ur}`,
        qaScore: data.qaScore,
        generatedAt: new Date().toISOString(),
      },
      locales: {
        en: {
          title: data.write.en.title,
          titleVariants: data.write.en.titleOptions.filter((t) => t !== data.write.en.title),
          slug: data.write.en.slug,
          dek: data.write.en.dek,
          keyPoints: data.write.en.keyPoints,
          bodyMarkdown: data.write.en.bodyMarkdown,
          whatItMeans: data.write.en.whatItMeans,
          faqs: data.write.en.faqs,
          tags: data.write.en.tags,
          altText: data.write.en.altText,
        },
        ur: {
          title: data.write.ur.title,
          titleVariants: data.write.ur.titleOptions.filter((t) => t !== data.write.ur.title),
          slug: data.write.ur.slug,
          dek: data.write.ur.dek,
          keyPoints: data.write.ur.keyPoints,
          bodyMarkdown: data.write.ur.bodyMarkdown,
          whatItMeans: data.write.ur.whatItMeans,
          faqs: data.write.ur.faqs,
          tags: data.write.ur.tags,
          altText: data.write.ur.altText,
        },
      },
    })
  } catch (e) {
    logger.warn({ err: e }, 'publish failed')
    return null
  }

  await deps.payload.patchCluster(data.clusterId, { status: 'published', article: res.id })

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
