import type { Redis } from 'ioredis'
import { XPostSchema, type XPost } from '@zaviya/shared'
import { z } from 'zod'
import type { BridgeServer } from '../bridge/server.js'
import type { WorkerEnv } from '../config.js'
import { logger } from '../logger.js'
import type { PayloadClient } from '../payload-client.js'
import { SITE_ORIGIN } from './link.js'
import { postX } from './x.js'
import { VIRAL_RULES, VIRAL_SOURCES, viralMode, type ViralSource } from './viral-config.js'
import { authorHandle, decideViral, pktDayKey, sourceFor, viralCopy, viralSlot, type Story } from './viral.js'

/**
 * Viral radar round (every 40 minutes): read the recent video posts of the watched accounts, score them, and
 *  - dry mode (default): only write what it WOULD post, and why it skipped the rest, to Redis (zaviya:viral:log)
 *  - live mode: quote-post the best one on X with our headline, the Zaviya link and the original post
 *  - off: nothing
 * Mode is VIRAL_RADAR=off|dry|live. Live posts follow the limits in viral-config.ts (4 a day, 90 minutes apart, not 00:00-08:00 PKT).
 */

export const VIRAL_JOB = 'viral-round'

const K = {
  log: 'zaviya:viral:log',
  seen: (id: string) => `zaviya:viral:seen:${id}`,
  done: (id: string) => `zaviya:viral:done:${id}`,
  day: (day: string) => `zaviya:viral:day:${day}`,
  last: 'zaviya:viral:last',
  rotation: 'zaviya:viral:rotation',
}
const SEEN_TTL_S = 24 * 3600
const DONE_TTL_S = 30 * 86_400
const LOG_MAX = 300

type Kv = Pick<Redis, 'get' | 'set' | 'incr' | 'expire' | 'lpush' | 'ltrim'>

export interface ViralDeps {
  env: WorkerEnv & { VIRAL_RADAR?: string }
  payload: PayloadClient
  bridge: Pick<BridgeServer, 'isOnline' | 'send'> & Partial<Pick<BridgeServer, 'isConnected'>>
  redis: Kv
  fetchFn?: typeof fetch
  now?: () => number
  pauseMs?: [number, number]
  sources?: ViralSource[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One search per group of accounts: videos only, no replies or reposts, a little traction already */
export function viralSearches(list: ViralSource[] = VIRAL_SOURCES, per = VIRAL_RULES.handlesPerSearch): string[] {
  const out: string[] = []
  for (let i = 0; i < list.length; i += per) {
    out.push(`(${list.slice(i, i + per).map((s) => `from:${s.handle}`).join(' OR ')}) filter:native_video -filter:replies -filter:nativeretweets min_faves:100`)
  }
  return out
}

/** Our latest stories from the public news sitemap (title and link), so the radar never needs the database */
export async function latestStories(fetchFn: typeof fetch = fetch, origin = SITE_ORIGIN): Promise<Story[]> {
  try {
    const res = await fetchFn(`${origin}/news-sitemap.xml`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return []
    const xml = await res.text()
    const out: Story[] = []
    for (const block of xml.split('<url>').slice(1)) {
      const url = block.match(/<loc>([^<]+)<\/loc>/)?.[1]
      const title = block.match(/<news:title>([^<]+)<\/news:title>/)?.[1]
      if (url && title) out.push({ url: url.trim(), title: title.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() })
    }
    return out
  } catch {
    return []
  }
}

export interface ViralLogRow {
  at: string
  mode: string
  action: 'would-post' | 'posted' | 'post-failed' | 'skipped'
  postUrl: string
  handle: string
  views?: number
  score?: number
  reason?: string
  story?: string
  copy?: string
}

async function log(redis: Kv, row: ViralLogRow): Promise<void> {
  await redis.lpush(K.log, JSON.stringify(row)).catch(() => undefined)
  await redis.ltrim(K.log, 0, LOG_MAX - 1).catch(() => undefined)
}

export async function runViralRound(deps: ViralDeps): Promise<Record<string, unknown>> {
  const mode = viralMode(deps.env.VIRAL_RADAR)
  if (mode === 'off') return { reason: 'viral radar is off' }
  if (!deps.bridge.isOnline()) return { reason: 'extension offline' }
  const now = deps.now?.() ?? Date.now()
  const sources = deps.sources ?? VIRAL_SOURCES
  const searches = viralSearches(sources)
  const stories = await latestStories(deps.fetchFn)

  const start = Number((await deps.redis.get(K.rotation).catch(() => null)) ?? 0) || 0
  const rounds = Math.min(VIRAL_RULES.searchesPerRound, searches.length)
  await deps.redis.set(K.rotation, String((start + rounds) % searches.length)).catch(() => undefined)
  const [pMin, pMax] = deps.pauseMs ?? [20_000, 60_000]

  const posts: XPost[] = []
  for (let i = 0; i < rounds; i++) {
    if (i > 0) await sleep(pMin + Math.random() * (pMax - pMin))
    try {
      const raw = await deps.bridge.send({ id: `viral_xs_${now}_${i}`, type: 'x.search', payload: { query: searches[(start + i) % searches.length]!, limit: 20 } }, 90_000)
      posts.push(...z.object({ posts: z.array(XPostSchema) }).parse(raw).posts)
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : e }, 'viral radar: search failed')
    }
  }

  const ranked: { post: XPost; src: ViralSource; score: number; story?: Story }[] = []
  const skips: Record<string, number> = {}
  for (const post of posts) {
    if (await deps.redis.get(K.done(post.id)).catch(() => null)) continue
    const d = decideViral(post, { now, stories, sources })
    if (d.action === 'skip') {
      skips[d.reason.replace(/[0-9,.]+/g, 'N')] = (skips[d.reason.replace(/[0-9,.]+/g, 'N')] ?? 0) + 1
      continue
    }
    const src = sourceFor(authorHandle(post), sources)
    if (src) ranked.push({ post, src, score: d.score, story: d.story })
  }
  ranked.sort((a, b) => b.score - a.score)

  // Every candidate is written once (dry mode shows what would have gone out)
  for (const r of ranked.slice(0, 5)) {
    if (await deps.redis.get(K.seen(r.post.id)).catch(() => null)) continue
    await deps.redis.set(K.seen(r.post.id), '1', 'EX', SEEN_TTL_S).catch(() => undefined)
    await log(deps.redis, {
      at: new Date(now).toISOString(),
      mode,
      action: 'would-post',
      postUrl: `https://x.com/${authorHandle(r.post)}/status/${r.post.id}`,
      handle: authorHandle(r.post),
      views: r.post.views,
      score: r.score,
      story: r.story?.url,
      copy: viralCopy(r.post, r.src, r.story),
    })
  }
  const summary = { mode, scanned: posts.length, candidates: ranked.length, skips }
  logger.info(summary, 'viral radar round')
  if (mode === 'dry' || !ranked.length) return summary

  // live: the best candidate, inside the daily limits
  const day = pktDayKey(now)
  const slot = viralSlot({ now, postedToday: Number((await deps.redis.get(K.day(day)).catch(() => 0)) ?? 0), lastPostedAt: Number((await deps.redis.get(K.last).catch(() => 0)) ?? 0) || null })
  if (!slot.ok) return { ...summary, held: slot.reason }
  const best = ranked[0]!
  const copy = viralCopy(best.post, best.src, best.story)
  const postUrl = `https://x.com/${authorHandle(best.post)}/status/${best.post.id}`
  let status = 'failed'
  let error: string | undefined
  const record = {
    upsertSocialPost: async (b: { status: string; error?: string }) => {
      status = b.status
      error = b.error
      return { id: `viral-${best.post.id}`, created: true }
    },
  } as unknown as PayloadClient
  try {
    // text carries our line, our link and, last, the original post: X shows it as a quote of the real video
    await postX({ articleId: `viral-${best.post.id}`, copy: { x: copy }, priority: 'normal' }, { env: deps.env, payload: record, bridge: deps.bridge as BridgeServer })
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  if (status === 'posted') {
    await deps.redis.set(K.done(best.post.id), '1', 'EX', DONE_TTL_S).catch(() => undefined)
    await deps.redis.incr(K.day(day)).catch(() => undefined)
    await deps.redis.expire(K.day(day), 2 * 86_400).catch(() => undefined)
    await deps.redis.set(K.last, String(now)).catch(() => undefined)
  }
  await log(deps.redis, { at: new Date(now).toISOString(), mode, action: status === 'posted' ? 'posted' : 'post-failed', postUrl, handle: authorHandle(best.post), views: best.post.views, score: best.score, story: best.story?.url, copy, reason: error })
  return { ...summary, posted: status === 'posted' ? postUrl : null, error }
}
