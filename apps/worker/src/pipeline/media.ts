import { fluxCreds, type WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import type { WriteResult } from './write.js'
import { logger } from '../logger.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import { renderSocialCardSet, categoryAccentColor } from './social-card.js'
import { renderPostCard } from './post-card.js'
import { findRealPhoto, findHeroPhoto } from './real-photo.js'
import { firstPassingPhoto } from './photo-qa.js'
import { generateViaZImage } from './zimage.js'
import { GeminiImageResultSchema } from '@zaviya/shared'
import type { BridgeServer } from '../bridge/server.js'
import { generateHeroViaWorkersAI, fluxPrompt } from './flux.js'
import { editorApproved } from './pitch.js'

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
/** Why the last Gemini attempt failed (e.g. gemini_user_active: Waleed is using the laptop) */
let lastGeminiError = ''

async function runGemini(
  prompt: string,
  bridge: Pick<BridgeServer, 'isOnline' | 'send'>,
  clusterId: string,
  account: string | undefined,
  timeoutMs: number,
): Promise<Blob | null> {
  if (!bridge.isOnline()) return null
  lastGeminiError = ''
  try {
    const raw = await bridge.send(
      { id: `img_${clusterId}_${Date.now()}`, type: 'gemini.image', payload: { prompt, account } },
      timeoutMs,
    )
    const img = GeminiImageResultSchema.parse(raw)
    logger.info({ clusterId, bytes: Math.round((img.base64.length * 3) / 4), size: `${img.width}x${img.height}` }, 'Gemini image received')
    return new Blob([Buffer.from(img.base64, 'base64')], { type: img.mimeType })
  } catch (e) {
    lastGeminiError = e instanceof Error ? e.message : String(e)
    if (/gemini_user_(active|locked)/.test(lastGeminiError)) {
      logger.info({ clusterId, reason: lastGeminiError }, 'Waleed is on the laptop (or it is locked): Gemini skipped')
      return null
    }
    logger.warn({ err: lastGeminiError, clusterId }, 'Gemini (extension) image failed')
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
export function deferImage(o: { gate: boolean; articleId?: string; priority: Priority; isUpdate?: boolean; approved?: boolean }): boolean {
  return o.gate && !o.articleId && o.priority !== 'breaking' && !o.isUpdate && !o.approved
}

/** Labelling of AI illustrations (last resort only) */
export const AI_MEDIA = { license: 'ai-generated', isAiGenerated: true, credit: 'Zaviya (AI illustration)' } as const

const MEDIA_FILE_PREFIX = '/api/media/file/'

/**
 * Public URL of an uploaded file. Payload serves /api/media/file/<name> from R2 through the web app (4-16 s when it is
 * busy, so Instagram gave up with "media could not be fetched"); the same object is on the R2 domain directly (ZAV-184).
 */
export function absoluteMediaUrl(baseUrl: string, url?: string | null, cdnBase?: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (cdnBase && url.startsWith(MEDIA_FILE_PREFIX)) return `${cdnBase.replace(/\/$/, '')}/${url.slice(MEDIA_FILE_PREFIX.length)}`
  const base = baseUrl.replace(/\/$/, '')
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`
}

async function uploadGeneratedPng(
  payload: PayloadClient,
  baseUrl: string,
  png: Buffer,
  alt: string,
  filename?: string,
  cdnBase?: string,
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
      url: absoluteMediaUrl(baseUrl, uploaded.url, cdnBase),
    }
  } catch (e) {
    logger.warn({ err: e }, 'generated PNG upload skipped')
    return null
  }
}

const IMAGE_RETRY_DELAY_MS = 15 * 60_000
/** Breaking news must not wait hours for an image: fewer, quicker retries before the branded card goes out (ZAV-299). */
const BREAKING_IMAGE_MAX_TRIES = 2
const BREAKING_IMAGE_RETRY_DELAY_MS = 5 * 60_000

/** Tries before a story goes out with the branded card instead of an illustration */
export function heroMaxTries(priority: Priority, max: number): number {
  return priority === 'breaking' ? Math.min(BREAKING_IMAGE_MAX_TRIES, max) : max
}

/**
 * Version of the social-card rules (photo choice, QA gate, labels). Bump it whenever a card fix ships: paced stories
 * wait hours or days to publish, and a story whose cards were made under older rules gets them made again at publish
 * time (11 Nov: a 05:54 KP card with a California meeting and an 'AI image' label went out at 13:45, after the fix).
 */
export const CARD_VERSION = 1

type RealHero = Awaited<ReturnType<typeof findHeroPhoto>>

/** Renders and uploads a story's social cards (post, portrait, wide). Returns their URLs and the wide card's media id. */
export async function renderStoryCards(
  input: { clusterId: string; write: WriteResult; category: string; priority: Priority; realHero?: RealHero | null },
  deps: { payload: PayloadClient; env: WorkerEnv },
): Promise<{ urls: string[]; ogId?: string }> {
  const urls: string[] = []
  let ogId: string | undefined
  const { write, category } = input
  const accent = categoryAccentColor(category)
  try {
    // Cards carry the hero photo and the headline: what people stop scrolling for
    // Social cards never carry the AI hero: the real hero photo, else a real photo of an entity the headline names,
    // else a clean text/brand card (an invented scene next to a real headline is how a US story got a Pakistani school)
    // Every photo passes the QA gate (subject named in the headline, free licence, size and shape); a rejected hero
    // (e.g. a face only the dek names) is replaced by a person-first lookup, so a named person never gets a black card.
    const qaCtx = { clusterId: input.clusterId, title: write.en.title }
    let real = firstPassingPhoto([input.realHero ?? null], write.en.title, qaCtx)
    if (!real) real = firstPassingPhoto([await findRealPhoto(write.en.title, write.en.tags).catch(() => null)], write.en.title, qaCtx)
    if (!real) logger.info(qaCtx, 'social card goes out without a real photo: no named subject has a free photo')
    const photo = real?.dataUrl ?? null
    const breaking = input.priority === 'breaking'
    const base = deps.env.PUBLIC_MEDIA_URL ?? deps.env.PAYLOAD_URL
    const cardsEn = await renderSocialCardSet({
      title: write.en.title,
      dek: write.en.dek,
      category,
      categoryColor: accent,
      locale: 'en',
      photo,
      photoCredit: real?.credit,
      breaking,
    })
    // No Urdu card: Satori cannot shape Nastaliq (letters come out reversed and broken)

    // The post card every platform gets: hero photo, Urdu + English headline (rendered in Chromium)
    const card = write.en.card
    const postPng = await renderPostCard(
      {
        title: write.en.title,
        category,
        photo,
        photoCredit: real?.credit,
        breaking,
        headlineUr: card?.headlineUr ?? write.ur?.title ?? null,
        highlight: card?.highlight,
        highlightUr: card?.highlightUr,
        figure: card?.figure,
        time: `${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })} PKT`,
      },
      deps.env.CHROMIUM_PATH,
    ).catch(() => null)
    const post = postPng
      ? await uploadGeneratedPng(deps.payload, base, postPng, `${write.en.title} — social post`, `${write.en.slug}-post`, deps.env.MEDIA_CDN_URL).catch(() => null)
      : null
    if (post?.url) urls.push(post.url)

    const [ogEn, portraitEn] = await Promise.all([
      uploadGeneratedPng(deps.payload, base, cardsEn.og, write.en.title, `${write.en.slug}-card`, deps.env.MEDIA_CDN_URL),
      uploadGeneratedPng(deps.payload, base, cardsEn.portrait, `${write.en.title} — Instagram card (EN)`, `${write.en.slug}-portrait`, deps.env.MEDIA_CDN_URL),
    ])
    ogId = ogEn?.id
    for (const u of [portraitEn?.url, ogEn?.url]) {
      if (u && !urls.includes(u)) urls.push(u)
    }
  } catch (e) {
    logger.warn({ err: e }, 'social card render/upload skipped')
  }
  return { urls, ogId }
}

/** Remakes the cards of a story whose cards predate CARD_VERSION, looking up its real photo again */
export async function rerenderStaleCards(
  input: { clusterId: string; write: WriteResult; category: string; priority: Priority },
  deps: { payload: PayloadClient; env: WorkerEnv },
): Promise<string[] | null> {
  const write = input.write
  const realHero = await findHeroPhoto({ title: write.en.title, dek: write.en.dek, brief: write.en.imageBrief || write.en.title, tags: write.en.tags }).catch(() => null)
  const { urls } = await renderStoryCards({ ...input, realHero }, deps)
  return urls.length ? urls : null
}

export async function processMediaJob(
  data: { clusterId: string; write: WriteResult; qaScore: number; priority: Priority; imageTries?: number; articleId?: string },
  deps: { payload: PayloadClient; env: WorkerEnv; publishQueue: Queue; mediaQueue?: Queue; bridge: Pick<BridgeServer, 'isOnline' | 'send'> },
): Promise<void> {
  let heroMediaId: string | undefined
  const socialMediaUrls: string[] = []

  const cluster = await deps.payload.getCluster(data.clusterId).catch(() => null)
  const triage = cluster?.triage as TriageResult | undefined
  const category = triage?.category ?? 'pakistan'

  if (deferImage({ gate: deps.env.EDITOR_GATE, articleId: data.articleId, priority: data.priority, isUpdate: triage?.isUpdateOfExisting, approved: editorApproved(triage) })) {
    await deps.publishQueue.add(
      'publish',
      { clusterId: data.clusterId, write: data.write, socialMediaUrls: [], qaScore: data.qaScore, priority: data.priority },
      { priority: 5 },
    )
    logger.info({ clusterId: data.clusterId }, 'image waits for the editor: sent as a text draft')
    return
  }

  // 1. A real, free-licence photo of what the story is about (Wikimedia Commons: person, organisation, place, building,
  //    or the topic fallback such as US Congress -> the Capitol). Never photos from outlets or agencies (copyright).
  const brief = data.write.en.imageBrief || data.write.en.title
  const realHero = await findHeroPhoto({ title: data.write.en.title, dek: data.write.en.dek, brief, tags: data.write.en.tags }).catch(() => null)
  if (realHero) logger.info({ clusterId: data.clusterId, ...realHero.meta }, 'hero: real photo from Wikimedia Commons')

  // 2. Last resort: a generic AI illustration (Gemini web is free so it goes first; FLUX on Workers AI is paid and the fallback).
  //    The prompt forbids real people, events, elections, disasters and specific buildings (fluxPrompt). Breaking news cannot wait for Gemini.
  const flux = async () => generateHeroViaWorkersAI(brief, { ...fluxCreds(deps.env), clusterId: data.clusterId })
  const gemini = async () => {
    const prompt = fluxPrompt(brief)
    for (const account of geminiAccounts(deps.env.GEMINI_WEB_ACCOUNT)) {
      const b = await generateHeroViaExtension(prompt, deps.bridge, data.clusterId, account, GEMINI_ACCOUNT_TIMEOUT_MS)
      if (b) {
        logger.info({ clusterId: data.clusterId, account }, 'hero image from Gemini')
        return b
      }
      // Laptop in use or locked: no other account will do better, go straight to FLUX (or hold the story when FLUX is off)
      if (/gemini_user_/.test(lastGeminiError)) break
    }
    return null
  }
  const zimage = async () => generateViaZImage(fluxPrompt(brief), { key: deps.env.FAL_KEY, clusterId: data.clusterId })
  const fluxFirst = data.priority === 'breaking' || deps.env.IMAGE_SOURCE === 'flux'
  const blob: Blob | null = realHero
    ? new Blob([new Uint8Array(realHero.bytes)], { type: realHero.mime })
    : deps.env.IMAGE_SOURCE === 'zimage' && deps.env.FAL_KEY
      ? ((await zimage()) ?? (await flux()) ?? (await gemini()))
      : fluxFirst
        ? ((await flux()) ?? (await gemini()))
        : ((await gemini()) ?? (await flux()))
  // No illustration yet: hold the story and retry. A story is never dropped for a missing image (ZAV-299): after the
  // last try it goes out with the branded Zaviya card as its hero, and a backfill job swaps in the Gemini image later.
  // Source-site photos are never reused (copyright), so there is no og:image step.
  const heroFallback = !blob
  if (!blob && deps.env.REQUIRE_HERO_IMAGE) {
    const tries = (data.imageTries ?? 0) + 1
    if (deps.mediaQueue && tries < heroMaxTries(data.priority, deps.env.HERO_IMAGE_MAX_TRIES)) {
      const delay = data.priority === 'breaking' ? BREAKING_IMAGE_RETRY_DELAY_MS : IMAGE_RETRY_DELAY_MS
      await deps.mediaQueue.add('media', { ...data, imageTries: tries }, { delay, priority: 5 })
      logger.info({ clusterId: data.clusterId, tries, retryInMin: delay / 60_000 }, 'no hero image yet: holding story, will retry')
      return
    }
    logger.warn({ clusterId: data.clusterId, tries, title: data.write.en.title }, 'no hero image after all retries: publishing with the branded card, Gemini image follows')
  }

  if (blob) {
    try {
      const uploaded = await deps.payload.uploadMedia(blob, {
        alt: data.write.en.altText?.trim() || data.write.en.title,
        ...(realHero ? { license: 'wikimedia', isAiGenerated: false, credit: realHero.meta.mediaCredit } : AI_MEDIA),
        filename: data.write.en.slug,
      })
      heroMediaId = uploaded.id
      logger.info({ clusterId: data.clusterId, mediaId: uploaded.id }, 'hero image uploaded')
    } catch (e) {
      logger.warn({ err: e }, 'hero upload skipped')
    }
  }

  const cards = await renderStoryCards({ clusterId: data.clusterId, write: data.write, category, priority: data.priority, realHero }, deps)
  socialMediaUrls.push(...cards.urls)
  if (!heroMediaId && cards.ogId) heroMediaId = cards.ogId
  logger.info({ clusterId: data.clusterId, heroPath: realHero ? 'real-photo' : blob ? 'ai-image' : heroMediaId ? 'branded-card-fallback' : 'none' }, 'hero image path')

  await deps.publishQueue.add(
    'publish',
    {
      clusterId: data.clusterId,
      write: data.write,
      heroMediaId,
      socialMediaUrls,
      cardVersion: CARD_VERSION,
      qaScore: data.qaScore,
      priority: data.priority,
      ...(heroFallback ? { heroFallback: true } : {}),
      ...(data.articleId ? { articleId: data.articleId } : {}),
    },
    { priority: data.priority === 'breaking' || data.articleId ? 1 : 5 },
  )
}
