import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import type { WriteResult } from './write.js'
import { logger } from '../logger.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import { renderSocialCardSet, categoryAccentColor, photoDataUrl } from './social-card.js'
import { GeminiImageResultSchema } from '@zaviya/shared'
import type { BridgeServer } from '../bridge/server.js'
import { generateHeroViaWorkersAI } from './flux.js'
import { describeReferenceScene } from './reference.js'

export type { SocialCardRenderInput } from './social-card.js'
export { renderSocialCard, renderSocialCardSet } from './social-card.js'

/**
 * Hero images come only from Gemini web through the logged-in browser extension.
 * No API fallback: if the bridge is offline or Gemini refuses, the branded card is used instead.
 */
export async function generateHeroViaExtension(
  prompt: string,
  bridge: Pick<BridgeServer, 'isOnline' | 'send'>,
  clusterId: string,
  account?: string,
): Promise<Blob | null> {
  if (!bridge.isOnline()) {
    logger.info({ clusterId }, 'extension offline — skipping Gemini hero image')
    return null
  }
  // The extension makes one Gemini image at a time. Queue here, so each job's timeout covers only its own run
  // (before, jobs waiting behind each other ran out of time and every one failed as "bridge job timeout").
  const turn = geminiQueue.then(() => runGemini(prompt, bridge, clusterId, account))
  // Space out attempts: dozens of prompts a minute from one account look like abuse to Google.
  geminiQueue = turn.catch(() => null).then((blob) => sleep(blob ? MIN_GAP_AFTER_SUCCESS_MS : MIN_GAP_AFTER_FAILURE_MS))
  return turn
}

const MIN_GAP_AFTER_SUCCESS_MS = 30_000
const MIN_GAP_AFTER_FAILURE_MS = 120_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let geminiQueue: Promise<unknown> = Promise.resolve()

async function runGemini(
  prompt: string,
  bridge: Pick<BridgeServer, 'isOnline' | 'send'>,
  clusterId: string,
  account?: string,
): Promise<Blob | null> {
  if (!bridge.isOnline()) return null
  try {
    const raw = await bridge.send(
      { id: `img_${clusterId}_${Date.now()}`, type: 'gemini.image', payload: { prompt: heroPrompt(prompt), account } },
      // Slightly longer than the extension's own 300s ceiling, so its real error arrives first.
      330_000,
    )
    const img = GeminiImageResultSchema.parse(raw)
    logger.info({ clusterId, bytes: Math.round((img.base64.length * 3) / 4), size: `${img.width}x${img.height}` }, 'Gemini image received')
    return new Blob([Buffer.from(img.base64, 'base64')], { type: img.mimeType })
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e, clusterId }, 'Gemini (extension) image failed')
    return null
  }
}

/** Illustrations only: never a fake "photo" of real people or events. */
export function heroPrompt(brief: string): string {
  return [
    brief.trim(),
    'Style: clean modern editorial illustration for a news website, 16:9 landscape, soft natural light, rich but calm colours.',
    'Do not depict identifiable real people, faces of politicians or celebrities, logos, flags with text, or any written text/letters.',
    'It must clearly look like an illustration, not a photograph.',
  ].join(' ')
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
  filename?: string,
): Promise<{ id: string; url?: string } | null> {
  try {
    const uploaded = await payload.uploadMedia(new Blob([png], { type: 'image/png' }), {
      alt,
      // Branded text cards are our own design, not AI imagery.
      license: 'own',
      isAiGenerated: false,
      credit: 'Zaviya',
      filename,
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

const IMAGE_RETRY_DELAY_MS = 15 * 60_000

export async function processMediaJob(
  data: { clusterId: string; write: WriteResult; qaScore: number; priority: Priority; imageTries?: number },
  deps: { payload: PayloadClient; env: WorkerEnv; publishQueue: Queue; mediaQueue?: Queue; bridge: Pick<BridgeServer, 'isOnline' | 'send'> },
): Promise<void> {
  let heroMediaId: string | undefined
  const socialMediaUrls: string[] = []

  const cluster = await deps.payload.getCluster(data.clusterId).catch(() => null)
  const triage = cluster?.triage as TriageResult | undefined
  const category = triage?.category ?? 'pakistan'
  const accent = categoryAccentColor(category)

  // Never reuse source photos (copyright). IMAGE_SOURCE=flux: Workers AI first (fast, server-side, 24/7),
  // Gemini web through the extension as backup. IMAGE_SOURCE=extension: the other way round.
  const brief = data.write.en.imageBrief || data.write.en.title
  const flux = async () => {
    // Look at the real photo behind the story (described in words, never reused) so the image fits the event.
    const scene = await describeReferenceScene(cluster?.items.map((i) => i.url) ?? [], {
      geminiApiKey: deps.env.GEMINI_API_KEY,
      clusterId: data.clusterId,
    }).catch(() => null)
    return generateHeroViaWorkersAI(brief, {
      accountId: deps.env.CLOUDFLARE_ACCOUNT_ID,
      token: deps.env.CLOUDFLARE_AI_TOKEN,
      clusterId: data.clusterId,
      scene,
    })
  }
  const gemini = () => generateHeroViaExtension(brief, deps.bridge, data.clusterId, deps.env.GEMINI_WEB_ACCOUNT)
  let blob: Blob | null
  if (deps.env.IMAGE_SOURCE === 'flux') {
    blob = (await flux()) ?? (await gemini())
  } else {
    blob = await gemini()
    const geminiTries = (data.imageTries ?? 0) + 1
    if (!blob && (!deps.bridge.isOnline() || geminiTries >= deps.env.GEMINI_IMAGE_TRIES_BEFORE_FALLBACK)) blob = await flux()
  }
  // No real illustration yet: hold the story and try again later instead of publishing a text card.
  if (!blob && deps.env.REQUIRE_HERO_IMAGE) {
    const tries = (data.imageTries ?? 0) + 1
    if (deps.mediaQueue && tries < deps.env.HERO_IMAGE_MAX_TRIES) {
      await deps.mediaQueue.add('media', { ...data, imageTries: tries }, { delay: IMAGE_RETRY_DELAY_MS, priority: 5 })
      logger.info({ clusterId: data.clusterId, tries, retryInMin: IMAGE_RETRY_DELAY_MS / 60_000 }, 'no hero image yet: holding story, will retry')
    } else {
      logger.warn({ clusterId: data.clusterId, tries, title: data.write.en.title }, 'no hero image after all retries: story NOT published')
    }
    return
  }

  if (blob) {
    try {
      const uploaded = await deps.payload.uploadMedia(blob, {
        alt: data.write.en.altText?.trim() || data.write.en.title,
        license: 'ai-generated',
        isAiGenerated: true,
        credit: 'Zaviya',
        filename: data.write.en.slug,
      })
      heroMediaId = uploaded.id
      logger.info({ clusterId: data.clusterId, mediaId: uploaded.id }, 'hero image from Gemini (extension)')
    } catch (e) {
      logger.warn({ err: e }, 'hero upload skipped')
    }
  }

  try {
    // Cards carry the hero photo and the headline: what people stop scrolling for
    const photo = await photoDataUrl(blob).catch(() => null)
    const breaking = data.priority === 'breaking'
    const cardsEn = await renderSocialCardSet({
      title: data.write.en.title,
      dek: data.write.en.dek,
      category,
      categoryColor: accent,
      locale: 'en',
      photo,
      breaking,
    })
    // No Urdu card: Satori cannot shape Nastaliq (letters come out reversed and broken)
    const cardsUr = null as { portrait: Buffer } | null

    const [ogEn, portraitEn, portraitUr] = await Promise.all([
      uploadGeneratedPng(
        deps.payload,
        deps.env.PUBLIC_MEDIA_URL ?? deps.env.PAYLOAD_URL,
        cardsEn.og,
        data.write.en.title,
        `${data.write.en.slug}-card`,
      ),
      uploadGeneratedPng(
        deps.payload,
        deps.env.PUBLIC_MEDIA_URL ?? deps.env.PAYLOAD_URL,
        cardsEn.portrait,
        `${data.write.en.title} — Instagram card (EN)`,
        `${data.write.en.slug}-portrait`,
      ),
      cardsUr && data.write.ur
        ? uploadGeneratedPng(deps.payload, deps.env.PUBLIC_MEDIA_URL ?? deps.env.PAYLOAD_URL, cardsUr.portrait, `${data.write.ur.title} — Instagram card (UR)`, `${data.write.ur.slug}-portrait-ur`)
        : Promise.resolve(null),
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
