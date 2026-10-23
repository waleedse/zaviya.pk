/**
 * One explainer round, start to finish: discover and rank ideas, pick one, have the script written (main worker),
 * have the voice and pictures made (Mac agent, through the media hub), render, preview on Telegram, post.
 * Idempotent per round key and per platform; a failed round leaves the idea in the backlog (two failures retire it).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sha1Hex } from '../../lib/idempotency.js'
import { logger } from '../../logger.js'
import type { ReelResult } from '../../social/reels.js'
import type { VideoConfig, VideoPlatform } from '../config.js'
import type { RedisLike } from '../job.js'
import { composeNarrated, type ApiArticle, type NarratedInput, type NarratedTimeline } from '../lib.js'
import { MediaHub } from '../media-hub.js'
import { hhmm, karachiDate, KARACHI_OFFSET_MS, runsOn, slotTimeMs, type Slot } from '../schedule.js'
import type { VideoTelegram } from '../telegram.js'
import { speechSentences, toSpeechText } from '../urdu-speech.js'
import { discoverIdeas, IdeaStore, pickIdea, type DiscoverArticle, type Idea } from './ideas.js'
import type { ExplainerScript, ScriptResult } from './script.js'

export const SCRIPT_WAIT_MS = 12 * 60_000
export const ASSET_WAIT_MS = 110 * 60_000
export const AGENT_ONLINE_MS = 3 * 60_000
/** an explainer never posts within this long of a scheduled video */
export const SLOT_BUFFER_MS = 45 * 60_000
export const IMAGE_STYLE =
  'flat vector illustration, soft gradient background in deep navy and warm yellow, clean simple shapes, friendly modern infographic style, no text, no letters, no numbers, no logos'
export const CTA = 'ایسی مزید کام کی باتیں زاویہ پر'

export interface ExplainerDeps {
  cfg: VideoConfig
  redis: RedisLike
  store: IdeaStore
  hub: MediaHub
  slots: Slot[]
  fetchArticles(pages: number): Promise<ApiArticle[]>
  fetchTrends(): Promise<string[]>
  /** the main worker writes the script (it has the LLM); null when it could not */
  requestScript(idea: Idea): Promise<ScriptResult | null>
  /** a picture from a paid API when the Mac did not deliver in time; null = none */
  fallbackImage?(prompt: string, width: number, height: number): Promise<Buffer | null>
  renderNarrated(args: { timeline: NarratedTimeline; outDir: string; assetsDir: string }): Promise<{ mp4: string; cover: string; durationMs: number }>
  telegram: VideoTelegram
  postReel(platform: VideoPlatform, input: { file: string; text: string; title?: string }): Promise<ReelResult>
  payload: { upsertSocialPost(body: Record<string, unknown> & { idempotencyKey: string; article: string; platform: string }): Promise<unknown> }
  sleep(ms: number): Promise<void>
  now(): number
}

export interface ExplainerOptions {
  /** post with no veto wait */
  now?: boolean
  /** make and preview, never post */
  dry?: boolean
  force?: boolean
  /** make this idea instead of the top one */
  ideaId?: string
  /** the round label, default: Karachi date and hour */
  round?: string
}

export interface ExplainerOutcome {
  status: 'already-done' | 'agent-offline' | 'no-idea' | 'script-failed' | 'assets-failed' | 'failed' | 'dry' | 'skipped' | 'posted'
  key: string
  idea?: string
  error?: string
  mp4?: string
  results?: Record<string, string>
}

const DONE_TTL = 30 * 86400
const NAMES: Record<VideoPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook' }

export function roundKey(now: number): string {
  return `${karachiDate(now)}-explainer-${String(new Date(now + KARACHI_OFFSET_MS).getUTCHours()).padStart(2, '0')}`
}

/** `t` moved after any scheduled video's post time it would crowd (45 min either side). */
export function shiftAwayFromSlots(t: number, slots: Slot[], vetoMin: number): number {
  let at = t
  for (let i = 0; i < 4; i++) {
    const weekday = new Date(at + KARACHI_OFFSET_MS).getUTCDay()
    const clash = slots.find((s) => runsOn(s, weekday) && Math.abs(slotTimeMs(s, at) + vetoMin * 60_000 - at) < SLOT_BUFFER_MS)
    if (!clash) return at
    at = slotTimeMs(clash, at) + vetoMin * 60_000 + SLOT_BUFFER_MS
  }
  return at
}

const stopped = (s: string) => (/[۔؟]$/.test(s.trim()) ? s.trim() : `${s.trim()}۔`)

/** The sentences of a script: what is shown (with its beat) and what the voice reads. */
export function scriptSentences(script: ExplainerScript): { beat: number; shown: string; spoken: string }[] {
  const out: { beat: number; shown: string; spoken: string }[] = []
  script.beats.forEach((b, bi) => {
    for (const s of b.text.split(/(?<=[۔؟])\s*/).filter(Boolean)) {
      const speech = toSpeechText(s)
      if (!speech.text) continue
      out.push({ beat: bi, shown: stopped(s), spoken: speechSentences(stopped(speech.text), 0)[0] ?? stopped(speech.text) })
    }
  })
  return out
}

export function explainerCaptions(script: ExplainerScript, siteUrl: string): Record<VideoPlatform, { text: string; title?: string }> {
  const tags = [...new Set(['Explainer', ...script.hashtags, 'Zaviya'])]
  const ig = [...tags.filter((t) => t !== 'Zaviya').slice(0, 2), 'Zaviya'].map((t) => `#${t}`).join(' ')
  const fb = [...tags.filter((t) => t !== 'Zaviya').slice(0, 1), 'Zaviya'].map((t) => `#${t}`).join(' ')
  return {
    instagram: { text: `${script.titleUr}\n\n${script.caption}\n\nمکمل پڑھیں: zaviya.pk (لنک بائیو میں)\n\n${ig}` },
    facebook: { text: `${script.titleUr}\n\n${script.caption}\n\nمزید: ${siteUrl}\n\n${fb}`, title: script.titleUr.slice(0, 100) },
  }
}

function toDiscover(a: ApiArticle, siteUrl: string): DiscoverArticle {
  return {
    id: a.id,
    title: a.title,
    dek: a.dek,
    category: a.category?.slug ?? '',
    priority: a.priority ?? 'normal',
    isBreaking: a.isBreaking,
    publishedAt: a.publishedAt,
    url: `${siteUrl}/${a.category?.slug ?? 'pakistan'}/${a.slug}`,
    tags: (a.tags ?? []).map((t) => t.name),
  }
}

export async function runExplainerRound(deps: ExplainerDeps, opts: ExplainerOptions = {}): Promise<ExplainerOutcome> {
  const { cfg, redis, store, hub, telegram } = deps
  const startedAt = deps.now()
  const key = opts.round ?? roundKey(startedAt)
  const log = logger.child({ key, explainer: true })

  if (!opts.force && (await redis.get(`explainer:done:${key}`))) return { status: 'already-done', key }

  // The Mac makes the voice and the pictures: without it there is nothing to wait for, the backlog simply waits for the next round.
  const seen = await hub.agentSeenAt()
  if (!seen || startedAt - seen > AGENT_ONLINE_MS) {
    log.info('explainer round skipped: the Mac agent is offline')
    return { status: 'agent-offline', key }
  }

  // 1. discover, rank, pick
  const articles = await deps.fetchArticles(1).catch(() => [] as ApiArticle[])
  const trends = await deps.fetchTrends().catch(() => [] as string[])
  await store.merge(discoverIdeas({ articles: articles.map((a) => toDiscover(a, cfg.siteUrl)), trends, now: startedAt }))
  await store.prune(startedAt)
  const idea = opts.ideaId ? await store.get(opts.ideaId) : pickIdea(await store.all(), startedAt, await store.madeTitles(startedAt))
  if (!idea) return { status: 'no-idea', key }
  log.info({ idea: idea.title, origin: idea.origin }, 'explainer picked')

  const fail = async (status: ExplainerOutcome['status'], error: string): Promise<ExplainerOutcome> => {
    log.warn({ error, idea: idea.title }, 'explainer round failed')
    const failures = (idea.failures ?? 0) + 1
    await store.put({ ...idea, failures, ...(failures >= 2 ? { decision: 'veto' as const, note: `retired after two failed rounds: ${error}`.slice(0, 300) } : {}) })
    await telegram.notify(`Explainer ${key} (${idea.title}) failed: ${error}`.slice(0, 3500)).catch(() => {})
    return { status, key, idea: idea.title, error }
  }

  // 2. script (main worker)
  const written = await deps.requestScript(idea).catch((e: unknown) => {
    log.warn({ err: String(e) }, 'script request failed')
    return null
  })
  if (!written) return fail('script-failed', 'the script could not be written')
  const script = written.script

  // 3. voice and pictures (Mac agent)
  const dir = path.join(cfg.dataDir, key)
  const assets = path.join(dir, 'assets')
  mkdirSync(assets, { recursive: true })
  const sentences = scriptSentences(script)
  if (!sentences.length) return fail('script-failed', 'the script has nothing to say')
  const tts = await hub.enqueue('tts', { sentences: sentences.map((s) => s.spoken), lengthScale: 0.9 }, `exp-${idea.id}-tts`)
  const images = await Promise.all(
    script.beats.map((b, i) =>
      hub.enqueue('image', { prompt: `${b.imagePrompt}, ${IMAGE_STYLE}`, width: 512, height: 512, quality: 'good', seed: 11 + i }, `exp-${idea.id}-img${i}`),
    ),
  )
  const voice = await hub.waitFor(tts, ASSET_WAIT_MS)
  if (voice?.status !== 'done') return fail('assets-failed', `voice: ${voice?.error ?? 'did not come back in time'}`)
  const wav = hub.readFile(voice)
  const sentenceMs = (voice.meta as { sentenceMs?: number[] } | undefined)?.sentenceMs
  if (!wav || !sentenceMs || sentenceMs.length !== sentences.length) return fail('assets-failed', 'the voice answer is incomplete')
  writeFileSync(path.join(assets, 'voice.wav'), wav)

  const beatFiles: string[] = []
  for (const [i, id] of images.entries()) {
    const wait = Math.max(0, ASSET_WAIT_MS - (deps.now() - startedAt))
    const job = await hub.waitFor(id, wait)
    const file = `beat${i + 1}.png`
    let bytes: Buffer | null = job?.status === 'done' ? hub.readFile(job) : null
    if (!bytes && deps.fallbackImage) bytes = await deps.fallbackImage(`${script.beats[i]!.imagePrompt}, ${IMAGE_STYLE}`, 1024, 1024).catch(() => null)
    if (!bytes) return fail('assets-failed', `picture ${i + 1}: ${job?.error ?? 'did not come back in time'}`)
    writeFileSync(path.join(assets, file), bytes)
    beatFiles.push(file)
  }

  // 4. compose and render
  let timeline: NarratedTimeline
  let mp4: string
  try {
    const input: NarratedInput = {
      title: script.title,
      titleUr: script.titleUr,
      audio: 'voice.wav',
      music: 'audio/calm.wav',
      theme: 'tech',
      cta: CTA,
      beats: script.beats.map((b, i) => ({
        image: beatFiles[i]!,
        credit: 'AI illustration',
        kicker: b.kicker,
        sentences: sentences.flatMap((s, si) => (s.beat === i ? [{ text: s.shown, ms: sentenceMs[si]! }] : [])),
      })),
    }
    timeline = composeNarrated(input)
    writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 2))
    writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ idea, script, sources: written.sourceUrls, model: written.model }, null, 2))
    const r = await deps.renderNarrated({ timeline, outDir: dir, assetsDir: assets })
    mp4 = r.mp4
  } catch (e) {
    return fail('failed', e instanceof Error ? e.message : String(e))
  }

  // 5. preview
  const captions = explainerCaptions(script, cfg.siteUrl)
  const vetoMin = cfg.vetoMin
  const postAt = opts.now ? deps.now() : shiftAwayFromSlots(deps.now() + vetoMin * 60_000, deps.slots, vetoMin)
  const targets = cfg.platforms.map((p) => NAMES[p]).join(' + ')
  const note = [
    `Explainer: ${script.title}`,
    opts.dry || !cfg.platforms.length ? 'DRY RUN: nothing will be posted.' : `Posting at ${hhmm(postAt)} PKT to ${targets}. Tap Skip to cancel.`,
    `Risk: ${script.risk}. Pictures: AI illustrations.`,
    written.sourceUrls.length ? `Sources: ${written.sourceUrls.slice(0, 3).join(' ')}` : 'No sources: general knowledge only.',
  ].join('\n')
  try {
    await telegram.sendPreview(mp4, note, key)
  } catch (e) {
    log.warn({ err: String(e) }, 'telegram preview failed')
  }
  if (opts.dry || !cfg.platforms.length) return { status: 'dry', key, idea: idea.title, mp4 }

  // 6. wait, honour Skip
  if (!opts.now) {
    const wait = postAt - deps.now()
    if (wait > 0) await deps.sleep(wait)
  }
  if (await redis.get(`video:skip:${key}`)) {
    await telegram.notify(`Explainer ${key} skipped (Skip button).`).catch(() => {})
    await redis.set(`explainer:done:${key}`, 'skipped', 'EX', DONE_TTL)
    await store.put({ ...idea, decision: 'veto', note: 'skipped on Telegram' })
    return { status: 'skipped', key, idea: idea.title, mp4 }
  }

  // 7. post (each platform claimed first so it can never go out twice)
  const anchor = String(idea.articleId ?? articles[0]?.id ?? 1)
  const results: Record<string, string> = {}
  for (const platform of cfg.platforms) {
    const claimed = await redis.set(`explainer:posted:${key}:${platform}`, '1', 'EX', 172800, 'NX')
    if (!claimed) {
      results[platform] = 'already posted or claimed: not posting again'
      continue
    }
    const copy = captions[platform]
    let result: ReelResult
    try {
      result = await deps.postReel(platform, { file: mp4, text: copy.text, title: copy.title })
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
    await deps.payload
      .upsertSocialPost({
        idempotencyKey: sha1Hex(`explainer:${key}:${platform}`),
        article: anchor,
        platform,
        format: 'reel',
        copy: copy.text,
        mediaUrls: [],
        status: result.ok ? 'posted' : 'failed',
        externalId: result.id,
        via: 'api',
        error: result.error,
        postedAt: result.ok ? new Date(deps.now()).toISOString() : undefined,
      })
      .catch((err: unknown) => log.warn({ platform, err: String(err) }, 'could not record social post'))
    results[platform] = result.ok ? `posted ${result.id}` : `FAILED ${result.error}`
  }

  const anyOk = Object.values(results).some((r) => r.startsWith('posted'))
  await telegram.notify(`Explainer ${key}: ${Object.entries(results).map(([p, r]) => `${NAMES[p as VideoPlatform]} ${r}`).join('; ')}`).catch(() => {})
  await redis.set(`explainer:done:${key}`, anyOk ? 'posted' : 'failed', 'EX', DONE_TTL)
  if (anyOk) await store.markMade(idea.id, deps.now())
  else await store.put({ ...idea, failures: (idea.failures ?? 0) + 1 })
  return { status: 'posted', key, idea: idea.title, mp4, results }
}

