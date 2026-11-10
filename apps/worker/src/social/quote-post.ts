import type { Redis } from 'ioredis'
import { XPostSchema } from '@zaviya/shared'
import { z } from 'zod'
import type { BridgeServer } from '../bridge/server.js'
import type { WorkerEnv } from '../config.js'
import { logger } from '../logger.js'
import type { ClusterItem, PayloadClient } from '../payload-client.js'
import { absoluteMediaUrl } from '../pipeline/media.js'
import { photoQa } from '../pipeline/photo-qa.js'
import { renderQuoteCard } from '../pipeline/quote-card.js'
import { findPhotoForSubjects, livingPeople, namedIn, type RealPhoto } from '../pipeline/real-photo.js'
import { effectiveCap, pktDayStart, type SocialPlatform } from './caps.js'
import { postFacebook } from './facebook.js'
import { currentTrends, pickHashtags, trendKeyword } from './hashtags.js'
import { postInstagram } from './instagram.js'
import { articleUrl as storyUrl } from './link.js'
import { HANDLES_PER_SEARCH, QUOTE_RULES, SEARCHES_PER_SCAN, WATCHLIST, type Personality } from './quote-config.js'
import { decideQuoteSlot, extractDirectQuotes, pktDay, quoteCopy, quoteFromXPost, quoteId, unsafeReason, type QuoteCandidate } from './quotes.js'
import { postX } from './x.js'

/**
 * Quote cards: "who said what". Candidates come from (a) the watch-list's own X posts (found through the extension's
 * x.search) and (b) direct quotes in the source items of stories we publish. One card per round, posted through the
 * social queue to Facebook, Instagram and X, with its own caps (quote-config.ts) next to the platforms' daily caps.
 */

export const QUOTE_JOB = 'quote'
const K = {
  done: (id: string) => `zaviya:quote:done:${id}`,
  posted: (id: string, platform: string) => `zaviya:quote:posted:${id}:${platform}`,
  day: (day: string) => `zaviya:quote:day:${day}`,
  last: 'zaviya:quote:last',
  inflight: 'zaviya:quote:inflight',
  pending: 'zaviya:quote:pending',
  rotation: 'zaviya:quote:rotation',
  log: 'zaviya:quote:log',
}
const DONE_TTL_S = 30 * 86_400
const PENDING_MAX = 60
const PENDING_TTL_S = 12 * 3600

type Kv = Pick<Redis, 'get' | 'set' | 'del' | 'incr' | 'expire' | 'lpush' | 'ltrim' | 'lrange'>

export interface QuoteDeps {
  env: WorkerEnv
  payload: PayloadClient
  bridge: Pick<BridgeServer, 'isOnline' | 'send'> & Partial<Pick<BridgeServer, 'isConnected'>>
  redis: Kv
  fetchFn?: typeof fetch
  now?: () => number
  /** Pause between browser searches (the account behaves like a person reading) */
  pauseMs?: [number, number]
}

// ---- (b) quotes in published stories --------------------------------------------------------------------------------

/**
 * Called when a story is published: the direct quotes in its source items become candidates (kept 12 h in Redis).
 * Never throws: a quote problem must not hold up publishing.
 */
export async function queueArticleQuotes(
  redis: Pick<Kv, 'lpush' | 'ltrim' | 'expire'>,
  items: Pick<ClusterItem, 'title' | 'url' | 'contentText' | 'summary' | 'publishedAt' | 'source'>[],
  story: { category: string; slug: string },
): Promise<number> {
  let n = 0
  try {
    for (const it of items) {
      const text = [it.title, it.summary, it.contentText].filter(Boolean).join('\n')
      for (const q of extractDirectQuotes(text)) {
        const known = WATCHLIST.find((p) => namedIn(q.speaker, p.name) || q.speaker.toLowerCase() === p.name.toLowerCase())
        const cand: QuoteCandidate = {
          quote: q.quote,
          speaker: known?.name ?? q.speaker,
          role: known?.role ?? q.role,
          wiki: known?.wiki ?? q.speaker,
          lang: /[؀-ۿ]/.test(q.quote) ? 'ur' : 'en',
          sourceUrl: it.url,
          sourceLabel: it.source.name,
          at: it.publishedAt,
          category: story.category,
          articleUrl: storyUrl(story.category, story.slug),
          score: 1.5,
        }
        await redis.lpush(K.pending, JSON.stringify(cand))
        n++
      }
    }
    if (n) {
      await redis.ltrim(K.pending, 0, PENDING_MAX - 1)
      await redis.expire(K.pending, PENDING_TTL_S)
    }
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : e }, 'quote candidates from the story not queued')
  }
  return n
}

// ---- (a) the watch-list on X ----------------------------------------------------------------------------------------

export function watchSearches(list: Personality[] = WATCHLIST, per = HANDLES_PER_SEARCH, minFaves = QUOTE_RULES.minFaves): { query: string; people: Personality[] }[] {
  const out: { query: string; people: Personality[] }[] = []
  for (let i = 0; i < list.length; i += per) {
    const people = list.slice(i, i + per)
    out.push({ query: `(${people.map((p) => `from:${p.handle}`).join(' OR ')}) -filter:replies -filter:nativeretweets min_faves:${minFaves}`, people })
  }
  return out
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function scanWatchlist(deps: QuoteDeps): Promise<QuoteCandidate[]> {
  if (!deps.bridge.isOnline()) return []
  const searches = watchSearches()
  const start = Number((await deps.redis.get(K.rotation).catch(() => null)) ?? 0) || 0
  await deps.redis.set(K.rotation, String((start + SEARCHES_PER_SCAN) % searches.length)).catch(() => undefined)
  const [pMin, pMax] = deps.pauseMs ?? [20_000, 60_000]
  const out: QuoteCandidate[] = []
  const now = deps.now?.() ?? Date.now()
  for (let i = 0; i < Math.min(SEARCHES_PER_SCAN, searches.length); i++) {
    const s = searches[(start + i) % searches.length]!
    if (i > 0) await sleep(pMin + Math.random() * (pMax - pMin))
    try {
      const raw = await deps.bridge.send({ id: `quote_xs_${now}_${i}`, type: 'x.search', payload: { query: s.query, limit: 20 } }, 90_000)
      for (const post of z.object({ posts: z.array(XPostSchema) }).parse(raw).posts) {
        const who = s.people.find((p) => p.handle.toLowerCase() === post.author.toLowerCase())
        const c = who ? quoteFromXPost(post, who, now) : null
        if (c) out.push(c)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn({ err: msg }, 'quote watch-list search failed')
      if (/checkpoint/.test(msg)) break
    }
  }
  return out
}

async function pendingFromStories(redis: Kv, now: number): Promise<QuoteCandidate[]> {
  const raw = await redis.lrange(K.pending, 0, PENDING_MAX - 1).catch(() => [] as string[])
  const out: QuoteCandidate[] = []
  for (const r of raw) {
    try {
      const c = JSON.parse(r) as QuoteCandidate
      if (now - Date.parse(c.at) <= QUOTE_RULES.maxAgeMs) out.push(c)
    } catch {
      // a bad entry is just dropped
    }
  }
  return out
}

// ---- choosing and building the card --------------------------------------------------------------------------------

/** Why a candidate cannot be posted, or null. Every check is on the words as said: nothing is rewritten. */
export function rejectReason(c: QuoteCandidate): string | null {
  if (c.quote.length < QUOTE_RULES.minChars || c.quote.length > QUOTE_RULES.maxChars) return `length ${c.quote.length}`
  const unsafe = unsafeReason(`${c.quote} ${c.speaker}`)
  if (unsafe) return `unsafe: ${unsafe}`
  return null
}

/**
 * Hashtags (three at most, never party or army) and the matching trending keyword, added after the quote text is final:
 * the writer-copy helpers strip hashtags, which must never touch words inside quote marks.
 */
export function withTags(copy: { facebook: string; instagram: string; x: string }, c: Pick<QuoteCandidate, 'speaker' | 'category' | 'quote'>, trends = currentTrends()): { facebook: string; instagram: string; x: string } {
  const story = { tags: [c.speaker], category: c.category, title: `${c.speaker} ${c.quote}` }
  const tags = pickHashtags({ ...story, trends })
  const kw = trendKeyword(story, trends, `${copy.facebook} ${c.speaker}`)
  const kwLine = kw ? `\n\nTrending: ${kw}` : ''
  const xTags = tags.slice(0, 2).join(' ')
  return {
    facebook: `${copy.facebook}${kwLine}\n\n${tags.slice(0, 2).join(' ')}`,
    instagram: `${copy.instagram}${kwLine}\n\n.\n${tags.join(' ')}`,
    x: copy.x.length + 1 + xTags.length <= 255 ? `${copy.x}\n${xTags}` : copy.x,
  }
}

async function relatedStory(c: QuoteCandidate, payload: Pick<PayloadClient, 'internalLinks'>): Promise<string | undefined> {
  if (c.articleUrl) return c.articleUrl
  try {
    const { links } = await payload.internalLinks([c.speaker], 'en', 5)
    return links.find((l) => namedIn(l.title, c.speaker) && /^https?:\/\//.test(l.url))?.url
  } catch {
    return undefined
  }
}

/**
 * One round: picks the best fresh quote that is safe, not yet posted, and has a real free photo of the speaker, renders its
 * card and puts it on the social queue. No photo, no card.
 */
export async function runQuoteRound(deps: QuoteDeps & { socialQueue: { add: (name: string, data: unknown, opts?: Record<string, unknown>) => Promise<unknown> } }): Promise<{ queued?: string; reason?: string; candidates: number }> {
  const now = deps.now?.() ?? Date.now()
  if (await deps.redis.get(K.inflight)) return { reason: 'a quote card is already waiting', candidates: 0 }
  const day = pktDay(now)
  if (Number((await deps.redis.get(K.day(day))) ?? 0) >= QUOTE_RULES.maxPerDay) return { reason: 'daily quote cap reached', candidates: 0 }

  const found = [...(await scanWatchlist(deps)), ...(await pendingFromStories(deps.redis, now))]
  const unique = new Map<string, QuoteCandidate>()
  for (const c of found) {
    const id = quoteId(c.speaker, c.quote)
    const prev = unique.get(id)
    if (!prev || c.score > prev.score) unique.set(id, c)
  }
  const ranked = [...unique.entries()].sort((a, b) => b[1].score - a[1].score || Date.parse(b[1].at) - Date.parse(a[1].at))
  const fetchFn = deps.fetchFn ?? fetch
  let tried = 0
  for (const [id, c] of ranked) {
    if (tried >= 4) break
    const why = rejectReason(c)
    if (why) {
      logger.info({ speaker: c.speaker, reason: why }, 'quote skipped')
      continue
    }
    if (await deps.redis.get(K.done(id))) continue
    tried++
    // a speaker found in an article must be a real, living person with a Wikipedia page
    if (!WATCHLIST.some((p) => p.name === c.speaker) && !(await livingPeople([c.wiki], fetchFn)).has(c.wiki)) {
      logger.info({ speaker: c.speaker }, 'quote skipped: speaker is not a known person')
      continue
    }
    const photo: RealPhoto | null = await findPhotoForSubjects([c.wiki], fetchFn, { minWidth: 600, minAspect: 0.45 })
    if (!photo) {
      logger.info({ speaker: c.speaker, wiki: c.wiki }, 'quote skipped: no free photo of the speaker')
      continue
    }
    const verdict = photoQa(photo, `${c.speaker} ${c.wiki}`)
    if (!verdict.ok) {
      logger.warn({ speaker: c.speaker, subject: photo.meta.subject, file: photo.meta.file, reason: verdict.reason }, 'social photo rejected')
      continue
    }
    // claim the quote: the same words are never posted twice, even when found again before the post goes out
    if ((await deps.redis.set(K.done(id), String(now), 'EX', DONE_TTL_S, 'NX')) !== 'OK') continue
    const release = () => deps.redis.del(K.done(id)).catch(() => undefined)
    const png = await renderQuoteCard(
      {
        quote: c.quote,
        speaker: c.speaker,
        role: c.role,
        sourceLabel: c.sourceLabel,
        lang: c.lang,
        photo: photo.dataUrl,
        photoCredit: photo.credit,
        time: `${new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })} PKT`,
      },
      deps.env.CHROMIUM_PATH,
    ).catch(() => null)
    if (!png) {
      await release()
      logger.warn({ speaker: c.speaker }, 'quote card did not render')
      continue
    }
    let mediaUrl: string | undefined
    try {
      const slug = c.speaker.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const up = await deps.payload.uploadMedia(new Blob([new Uint8Array(png)], { type: 'image/png' }), {
        alt: `${c.speaker}: quote card`,
        license: 'own',
        isAiGenerated: false,
        credit: photo.meta.mediaCredit,
        filename: `quote-${slug}-${id.slice(0, 8)}-post`,
      })
      mediaUrl = absoluteMediaUrl(deps.env.PUBLIC_MEDIA_URL ?? deps.env.PAYLOAD_URL, up.url, deps.env.MEDIA_CDN_URL)
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : e }, 'quote card upload failed')
    }
    if (!mediaUrl) {
      await release()
      continue
    }
    const articleUrl = await relatedStory(c, deps.payload)
    const copy = withTags(quoteCopy({ ...c, articleUrl }), c)
    await deps.redis.set(K.inflight, id, 'EX', 3 * 3600)
    await deps.socialQueue.add(QUOTE_JOB, { id, copy, mediaUrls: [mediaUrl], url: articleUrl, speaker: c.speaker, sourceUrl: c.sourceUrl, sourceLabel: c.sourceLabel, quote: c.quote, queuedAt: now }, { jobId: `quote-${id}`, priority: 8, removeOnComplete: 200, removeOnFail: 200 })
    logger.info({ id, speaker: c.speaker, source: c.sourceLabel, sourceUrl: c.sourceUrl, link: articleUrl ?? null }, 'quote card queued')
    return { queued: id, candidates: ranked.length }
  }
  return { reason: ranked.length ? 'no quote passed the checks' : 'no quotes found', candidates: ranked.length }
}

// ---- posting -------------------------------------------------------------------------------------------------------

export interface QuoteJobData {
  id: string
  copy: { facebook: string; instagram: string; x: string }
  mediaUrls: string[]
  url?: string
  speaker: string
  sourceUrl: string
  sourceLabel: string
  quote: string
  queuedAt: number
}

export type QuoteJobResult = { skipped: string } | { delayUntil: number; reason: string } | { posted: string[] }

/**
 * Posts one queued quote card to Facebook, Instagram and X. Waits for the quote-card rules (6 a day, 60 min apart, not
 * 00:00-08:00 PKT) and skips a platform whose own daily cap is used up. Quote posts are logged in Redis (zaviya:quote:log),
 * not in the social-posts collection (that one is tied to articles).
 */
export async function processQuoteJob(data: QuoteJobData, deps: QuoteDeps): Promise<QuoteJobResult> {
  const now = deps.now?.() ?? Date.now()
  const day = pktDay(now)
  const slot = decideQuoteSlot({ now, postedToday: Number((await deps.redis.get(K.day(day))) ?? 0), lastPostedAt: Number((await deps.redis.get(K.last)) ?? 0) || null })
  if (slot.action === 'skip') {
    await deps.redis.del(K.done(data.id), K.inflight).catch(() => undefined)
    logger.info({ id: data.id, reason: slot.reason }, 'quote card skipped')
    return { skipped: slot.reason }
  }
  if (slot.action === 'delay') return { delayUntil: slot.until, reason: slot.reason }

  const settings = await deps.payload.getSettings().catch(() => ({}) as import('../payload-client.js').PipelineSettings)
  const sent = await deps.payload.getSocialCount(pktDayStart(now)).catch(() => null)
  const posted: string[] = []
  const record = (platform: string) =>
    ({
      upsertSocialPost: async (b: { status: string; externalId?: string; error?: string; copy: string }) => {
        await deps.redis.lpush(K.log, JSON.stringify({ id: data.id, platform, status: b.status, externalId: b.externalId, error: b.error, speaker: data.speaker, sourceUrl: data.sourceUrl, link: data.url, copy: b.copy, at: new Date().toISOString() })).catch(() => undefined)
        await deps.redis.ltrim(K.log, 0, 299).catch(() => undefined)
        if (b.status === 'posted') {
          posted.push(platform)
          await deps.redis.set(K.posted(data.id, platform), '1', 'EX', DONE_TTL_S).catch(() => undefined)
        }
        return { id: `quote-${data.id}`, created: true }
      },
    }) as unknown as PayloadClient
  const articleId = `quote-${data.id}`
  for (const platform of ['facebook', 'instagram', 'x'] as SocialPlatform[]) {
    if (await deps.redis.get(K.posted(data.id, platform))) continue
    if (sent && (sent.counts[platform] ?? 0) >= effectiveCap(platform, settings.dailyCaps)) {
      logger.info({ id: data.id, platform }, 'quote card: platform daily cap reached, skipped there')
      continue
    }
    const common = { articleId, mediaUrls: data.mediaUrls, url: data.url }
    try {
      if (platform === 'facebook') await postFacebook({ ...common, copy: data.copy, format: 'card' }, { env: deps.env, payload: record(platform), bridge: deps.bridge as BridgeServer })
      else if (platform === 'instagram') await postInstagram({ ...common, copy: data.copy }, { env: deps.env, payload: record(platform) })
      else await postX({ ...common, copy: data.copy, priority: 'normal' }, { env: deps.env, payload: record(platform), bridge: deps.bridge as BridgeServer })
    } catch (e) {
      logger.warn({ id: data.id, platform, err: e instanceof Error ? e.message : e }, 'quote card post failed')
    }
  }
  await deps.redis.del(K.inflight).catch(() => undefined)
  if (!posted.length) {
    await deps.redis.del(K.done(data.id)).catch(() => undefined)
    return { skipped: 'nothing was posted' }
  }
  await deps.redis.incr(K.day(day)).catch(() => undefined)
  await deps.redis.expire(K.day(day), 2 * 86_400).catch(() => undefined)
  await deps.redis.set(K.last, String(now)).catch(() => undefined)
  logger.info({ id: data.id, speaker: data.speaker, platforms: posted, source: data.sourceUrl }, 'quote card posted')
  return { posted }
}
