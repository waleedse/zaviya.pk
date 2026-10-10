import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import type { WriteResult } from './write.js'
import { logger } from '../logger.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import { renderSocialCardSet, categoryAccentColor } from './social-card.js'

export type { SocialCardRenderInput } from './social-card.js'
export { renderSocialCard, renderSocialCardSet } from './social-card.js'

async function generateGeminiImage(prompt: string, env: WorkerEnv): Promise<Blob | null> {
  if (!env.GEMINI_API_KEY) return null
  const model = env.GEMINI_IMAGE_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    logger.warn({ status: res.status }, 'Gemini image generation failed')
    return null
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
  }
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
  if (!inline?.data) return null
  const buf = Buffer.from(inline.data, 'base64')
  return new Blob([buf], { type: inline.mimeType ?? 'image/png' })
}

function absoluteMediaUrl(baseUrl: string, url?: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const base = baseUrl.replace(/\/$/, '')
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`
}

async function uploadGeneratedPng(
  payload: PayloadClient,
  baseUrl: string,
  png: Buffer,
  alt: string,
): Promise<{ id: string; url?: string } | null> {
  try {
    const uploaded = await payload.uploadMedia(new Blob([png], { type: 'image/png' }), {
      alt,
      license: 'ai-generated',
      isAiGenerated: true,
      credit: 'Zaviya AI',
    })
    return {
      id: uploaded.id,
      url: absoluteMediaUrl(baseUrl, uploaded.url),
    }
  } catch (e) {
    logger.warn({ err: e }, 'generated PNG upload skipped')
    return null
  }
}

export async function processMediaJob(
  data: { clusterId: string; write: WriteResult; qaScore: number; priority: Priority },
  deps: { payload: PayloadClient; env: WorkerEnv; publishQueue: Queue },
): Promise<void> {
  let heroMediaId: string | undefined
  const socialMediaUrls: string[] = []

  const cluster = await deps.payload.getCluster(data.clusterId).catch(() => null)
  const triage = cluster?.triage as TriageResult | undefined
  const category = triage?.category ?? 'pakistan'
  const accent = categoryAccentColor(category)

  // Default: do NOT reuse og:image from sources (license). AI generate if Gemini configured.
  const blob = await generateGeminiImage(data.write.en.imageBrief || data.write.en.title, deps.env)
  if (blob) {
    try {
      const uploaded = await deps.payload.uploadMedia(blob, {
        alt: data.write.en.altText,
        license: 'ai-generated',
        isAiGenerated: true,
        credit: 'Zaviya AI',
      })
      heroMediaId = uploaded.id
    } catch (e) {
      logger.warn({ err: e }, 'hero upload skipped')
    }
  }

  try {
    const cardsEn = await renderSocialCardSet({
      title: data.write.en.title,
      dek: data.write.en.dek,
      category,
      categoryColor: accent,
      locale: 'en',
    })
    const cardsUr = await renderSocialCardSet({
      title: data.write.ur.title,
      dek: data.write.ur.dek,
      category,
      categoryColor: accent,
      locale: 'ur',
    })

    const [ogEn, portraitEn, portraitUr] = await Promise.all([
      uploadGeneratedPng(
        deps.payload,
        deps.env.PAYLOAD_URL,
        cardsEn.og,
        `${data.write.en.title} — social OG card`,
      ),
      uploadGeneratedPng(
        deps.payload,
        deps.env.PAYLOAD_URL,
        cardsEn.portrait,
        `${data.write.en.title} — Instagram card (EN)`,
      ),
      uploadGeneratedPng(
        deps.payload,
        deps.env.PAYLOAD_URL,
        cardsUr.portrait,
        `${data.write.ur.title} — Instagram card (UR)`,
      ),
    ])

    if (!heroMediaId && ogEn?.id) {
      heroMediaId = ogEn.id
    }

    for (const u of [portraitEn?.url, portraitUr?.url, ogEn?.url]) {
      if (u && !socialMediaUrls.includes(u)) socialMediaUrls.push(u)
    }
  } catch (e) {
    logger.warn({ err: e }, 'social card render/upload skipped')
  }

  await deps.publishQueue.add(
    'publish',
    {
      clusterId: data.clusterId,
      write: data.write,
      heroMediaId,
      socialMediaUrls,
      qaScore: data.qaScore,
      priority: data.priority,
    },
    { priority: data.priority === 'breaking' ? 1 : 5 },
  )
}
