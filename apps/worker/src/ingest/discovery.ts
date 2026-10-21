import { createHash } from 'node:crypto'
import { InstagramPostRefSchema, XPostSchema, XTrendSchema, type InstagramPostRef, type XPost, type XTrend } from '@zaviya/shared'
import { z } from 'zod'
import type { BridgeServer } from '../bridge/server.js'
import type { SourceItemInput } from '../payload-client.js'
import { logger } from '../logger.js'
import { X_TRENDS_KEY } from '../queues-keys.js'

/**
 * Discovery through the logged-in browser extension: what Pakistan is talking about
 * on X and Instagram. Posts only seed stories (and get embedded); facts still come
 * from multiple sources during triage and writing.
 */

export { X_TRENDS_KEY }

/** Official and newsroom accounts worth watching. `min_faves` keeps noise out. */
export const DEFAULT_X_QUERIES = [
  '(from:GovtofPakistan OR from:StateBank_Pak OR from:PTAofficialpk OR from:ForeignOfficePk OR from:NDMA_PK OR from:FinMinistryPak) -filter:replies',
  '(from:TheRealPCB OR from:OGRA_Official OR from:PakistanPolice OR from:pmln_org OR from:PTIofficial) -filter:replies',
  'Pakistan breaking lang:en min_faves:200 -filter:replies',
  'پاکستان min_faves:200 -filter:replies',
  // AI and jobs: Waleed wants at least one story of each every 4 hours
  '(from:OpenAI OR from:GoogleDeepMind OR from:AnthropicAI OR from:MetaAI OR from:MITIT_Pakistan OR from:MoITTOfficial) -filter:replies',
  '(jobs OR vacancies OR "apply now" OR NTS OR FPSC OR PPSC) Pakistan min_faves:50 -filter:replies',
]

/** Public newsroom profiles; edit with DISCOVERY_IG_PROFILES (comma separated). */
export const DEFAULT_IG_PROFILES = ['geonews.tv', 'dawn.today', 'arynewsofficial', 'samaatv', 'propakistani']

const URDU_RE = /[؀-ۿ]/g

export function detectLang(text: string): 'ur' | 'en' {
  const letters = text.replace(/[^\p{L}]/gu, '').length || 1
  return (text.match(URDU_RE)?.length ?? 0) / letters > 0.4 ? 'ur' : 'en'
}

function firstLine(text: string, max = 140): string {
  const clean = text.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

const hash = (s: string) => createHash('sha1').update(s).digest('hex')

export function xPostsToItems(sourceId: string, posts: XPost[], context?: string): SourceItemInput[] {
  return posts
    .filter((p) => p.text.replace(/https?:\/\/\S+/g, '').trim().length >= 40)
    .map((p) => ({
      sourceId,
      externalId: `x:${p.id}`,
      url: `https://x.com/${p.author}/status/${p.id}`,
      title: firstLine(p.text),
      summary: context ? `${context} · @${p.author}` : `@${p.author} on X`,
      contentText: p.text,
      publishedAt: p.createdAt,
      lang: detectLang(p.text),
      hash: hash(`${p.id}|${p.text}`),
    }))
}

export function instagramPostsToItems(sourceId: string, posts: InstagramPostRef[]): SourceItemInput[] {
  return posts
    .filter((p) => p.caption.length >= 40)
    .map((p) => ({
      sourceId,
      externalId: `ig:${p.shortcode}`,
      url: p.url,
      title: firstLine(p.caption),
      summary: `@${p.username} on Instagram`,
      contentText: p.caption,
      publishedAt: new Date().toISOString(),
      lang: detectLang(p.caption),
      hash: hash(`${p.shortcode}|${p.caption}`),
    }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min))

export interface DiscoveryResult {
  xTrends: XTrend[]
  items: SourceItemInput[]
  errors: string[]
}

export async function runDiscovery(deps: {
  bridge: Pick<BridgeServer, 'isOnline' | 'send'>
  xSourceId?: string
  igSourceId?: string
  xQueries?: string[]
  igProfiles?: string[]
  /** Pause between browser actions, so the accounts behave like a person reading. */
  pauseMs?: [number, number]
}): Promise<DiscoveryResult> {
  const out: DiscoveryResult = { xTrends: [], items: [], errors: [] }
  if (!deps.bridge.isOnline()) return out
  const [pMin, pMax] = deps.pauseMs ?? [20_000, 60_000]
  let n = 0
  const call = async <S extends z.ZodTypeAny>(job: Parameters<BridgeServer['send']>[0], schema: S): Promise<z.infer<S> | null> => {
    if (n++ > 0) await jitter(pMin, pMax)
    try {
      return schema.parse(await deps.bridge.send(job, 90_000)) as z.infer<S>
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      out.errors.push(`${job.type}: ${msg}`)
      logger.warn({ job: job.type, err: msg }, 'discovery job failed')
      // A checkpoint means the account is being watched: stop for this round.
      if (/checkpoint/.test(msg)) throw e
      return null
    }
  }

  const id = (t: string) => `disc_${t}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const postsSchema = z.object({ posts: z.array(XPostSchema) })

  try {
    if (deps.xSourceId) {
      const trends = await call({ id: id('xt'), type: 'x.trending', payload: {} }, z.object({ trends: z.array(XTrendSchema) }))
      out.xTrends = trends?.trends ?? []
      for (const t of out.xTrends.slice(0, 3)) {
        const res = await call({ id: id('xs'), type: 'x.search', payload: { query: `${t.name} min_faves:50`, limit: 10 } }, postsSchema)
        if (res) out.items.push(...xPostsToItems(deps.xSourceId, res.posts, `Trending on X: ${t.name}`))
      }
      for (const q of deps.xQueries ?? DEFAULT_X_QUERIES) {
        const res = await call({ id: id('xs'), type: 'x.search', payload: { query: q, limit: 15 } }, postsSchema)
        if (res) out.items.push(...xPostsToItems(deps.xSourceId, res.posts))
      }
    }
    if (deps.igSourceId) {
      for (const username of deps.igProfiles ?? DEFAULT_IG_PROFILES) {
        const res = await call(
          { id: id('ig'), type: 'instagram.readProfile', payload: { username, limit: 6 } },
          z.object({ posts: z.array(InstagramPostRefSchema) }),
        )
        if (res) out.items.push(...instagramPostsToItems(deps.igSourceId, res.posts))
      }
    }
  } catch {
    /* checkpoint: return what we have */
  }
  return out
}
