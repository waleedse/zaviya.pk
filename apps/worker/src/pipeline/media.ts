import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import type { WriteResult } from './write.js'
import { logger } from '../logger.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import { renderSocialCardSet, categoryAccentColor, photoDataUrl } from './social-card.js'
import { renderPostCard } from './post-card.js'
import { GeminiImageResultSchema } from '@zaviya/shared'
import type { BridgeServer } from '../bridge/server.js'
import { generateHeroViaWorkersAI, fluxPrompt } from './flux.js'
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
  timeoutMs = 330_000,
): Promise<Blob | null> {
  if (!bridge.isOnline()) {
    logger.info({ clusterId }, 'extension offline — skipping Gemini hero image')
    return null
  }
  // The extension makes one Gemini image at a time. Queue here, so each job's timeout covers only its own run
  // (before, jobs waiting behind each other ran out of time and every one failed as "bridge job timeout").
  const turn = geminiQueue.then(() => runGemini(prompt, bridge, clusterId, account, timeoutMs))
  // Space out attempts: dozens of prompts a minute from one account look like abuse to Google.
  geminiQueue = turn.catch(() => null).then((blob) => sleep(blob ? MIN_GAP_AFTER_SUCCESS_MS : MIN_GAP_AFTER_FAILURE_MS))
  return turn
}

const MIN_GAP_AFTER_SUCCESS_MS = 30_000
const MIN_GAP_AFTER_FAILURE_MS = 20_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let geminiQueue: Promise<unknown> = Promise.resolve()

async function runGemini(
  prompt: string,
  bridge: Pick<BridgeServer, 'isOnline' | 'send'>,
  clusterId: string,
  account: string | undefined,
  timeoutMs: number,
): Promise<Blob | null> {
  if (!bridge.isOnline()) return null
  try {
    const raw = await bridge.send(
      { id: `img_${clusterId}_${Date.now()}`, type: 'gemini.image', payload: { prompt, account } },
      timeoutMs,
    )
    const img = GeminiImageResultSchema.parse(raw)
    logger.info({ clusterId, bytes: Math.round((img.base64.length * 3) / 4), size: `${img.width}x${img.height}` }, 'Gemini image received')
    return new Blob([Buffer.from(img.base64, 'base64')], { type: img.mimeType })
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e, clusterId }, 'Gemini (extension) image failed')
    return null
  }
}

/** Gemini accounts to try in order (GEMINI_WEB_ACCOUNT, comma separated: an email or the /u/N number). */
export function geminiAccounts(setting: string | undefined): (string | undefined)[] {
  const list = (setting ?? '').split(',').map((a) => a.trim()).filter(Boolean)
  return list.length ? list : [undefined]
}

/** Per account: Gemini usually answers in under a minute; past this, the next account or FLUX takes over. */
export const GEMINI_ACCOUNT_TIMEOUT_MS = 150_000

/**
 * Whether the image waits for the editor. With the gate on, a normal story goes to the editor as a
 * text draft and gets its image only once approved (half the stories never run, so half the images were waste).
 */
export function deferImage(o: { gate: boolean; articleId?: string; priority: Priority; isUpdate?: boolean }): boolean {
  return o.gate && !o.articleId && o.priority !== 'breaking' && !o.isUpdate
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
  data: { clusterId: string; write: WriteResult; qaScore: number; priority: Priority; imageTries?: number; articleId?: string },
  deps: { payload: PayloadClient; env: WorkerEnv; publishQueue: Queue; mediaQueue?: Queue; bridge: Pick<BridgeServer, 'isOnline' | 'send'> },
): Promise<void> {
  let heroMediaId: string | undefined
  const socialMediaUrls: string[] = []

  const cluster = await deps.payload.getCluster(data.clusterId).catch(() => null)
  const triage = cluster?.triage as TriageResult | undefined
  const category = triage?.category ?? 'pakistan'
  const accent = categoryAccentColor(category)

  if (deferImage({ gate: deps.env.EDITOR_GATE, articleId: data.articleId, priority: data.priority, isUpdate: triage?.isUpdateOfExisting })) {
    await deps.publishQueue.add(
      'publish',
      { clusterId: data.clusterId, write: data.write, socialMediaUrls: [], qaScore: data.qaScore, priority: data.priority },
      { priority: 5 },
    )
    logger.info({ clusterId: data.clusterId }, 'image waits for the editor: sent as a text draft')
    return
  }

  // Never reuse source photos (copyright). Gemini web (Waleed's AI Pro account, then the next one listed) is free,
  // so it goes first; FLUX on Workers AI (paid per image) is the fallback. Breaking news cannot wait for Gemini.
  const brief = data.write.en.imageBrief || data.write.en.title
  // Look at the real photo behind the story (described in words, never reused) so the image fits the event.
  let scenePromise: Promise<string | null> | null = null
  const scene = () =>
    (scenePromise ??= describeReferenceScene(cluster?.items.map((i) => i.url) ?? [], {
      geminiApiKey: deps.env.GEMINI_API_KEY,
      clusterId: data.clusterId,
    }).catch(() => null))
  const flux = async () =>
    generateHeroViaWorkersAI(brief, {
      accountId: deps.env.CLOUDFLARE_ACCOUNT_ID,
      token: deps.env.CLOUDFLARE_AI_TOKEN,
      clusterId: data.clusterId,
      scene: await scene(),
    })
  const gemini = async () => {
    const prompt = fluxPrompt(brief, await scene())
    for (const account of geminiAccounts(deps.env.GEMINI_WEB_ACCOUNT)) {
      const b = await generateHeroViaExtension(prompt, deps.bridge, data.clusterId, account, GEMINI_ACCOUNT_TIMEOUT_MS)
      if (b) {
        logger.info({ clusterId: data.clusterId, account }, 'hero image from Gemini')
        return b
      }
    }
    return null
  }
  const fluxFirst = data.priority === 'breaking' || deps.env.IMAGE_SOURCE === 'flux'
  const blob: Blob | null = fluxFirst ? ((await flux()) ?? (await gemini())) : ((await gemini()) ?? (await flux()))
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

    // The post card every platform gets: hero photo, Urdu + English headline (rendered in Chromium)
    const card = data.write.en.card
    const postPng = await renderPostCard(
      {
        title: data.write.en.title,
        category,
        photo,
        breaking,
        headlineUr: card?.headlineUr ?? data.write.ur?.title ?? null,
        highlight: card?.highlight,
        highlightUr: card?.highlightUr,
        figure: card?.figure,
        time: `${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })} PKT`,
      },
      deps.env.CHROMIUM_PATH,
    ).catch(() => null)
    const post = postPng
      ? await uploadGeneratedPng(deps.payload, deps.env.PUBLIC_MEDIA_URL ?? deps.env.PAYLOAD_URL, postPng, `${data.write.en.title} — social post`, `${data.write.en.slug}-post`).catch(() => null)
      : null
    if (post?.url) socialMediaUrls.push(post.url)

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
      ...(data.articleId ? { articleId: data.articleId } : {}),
    },
    { priority: data.priority === 'breaking' || data.articleId ? 1 : 5 },
  )
}
