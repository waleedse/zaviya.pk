import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import type { WriteResult } from './write.js'
import { logger } from '../logger.js'
import type { Priority } from '@zaviya/shared'

/** TODO: satori + @resvg/resvg-js branded cards (1080x1350, 1200x630). */
export interface SocialCardRenderInput {
  title: string
  dek: string
  category: string
  locale: 'en' | 'ur'
}

export function renderSocialCard(_input: SocialCardRenderInput): null {
  logger.debug('social card render stub — install satori to enable')
  return null
}

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

export async function processMediaJob(
  data: { clusterId: string; write: WriteResult; qaScore: number; priority: Priority },
  deps: { payload: PayloadClient; env: WorkerEnv; publishQueue: Queue },
): Promise<void> {
  let heroMediaId: string | undefined
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

  renderSocialCard({
    title: data.write.en.title,
    dek: data.write.en.dek,
    category: 'news',
    locale: 'en',
  })

  await deps.publishQueue.add(
    'publish',
    {
      clusterId: data.clusterId,
      write: data.write,
      heroMediaId,
      qaScore: data.qaScore,
      priority: data.priority,
    },
    { priority: data.priority === 'breaking' ? 1 : 5 },
  )
}
