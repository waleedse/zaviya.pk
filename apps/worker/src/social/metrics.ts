import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { logger } from '../logger.js'
import { buildOAuthHeader } from './x-oauth.js'

/** ZAV-108: how each post did, fetched about 1 h and 24 h after posting, plus daily follower counts. */

export type Platform = 'facebook' | 'instagram' | 'x'
export type MetricValues = Record<string, number | string | null>
type FetchFn = typeof fetch

const GRAPH = 'https://graph.facebook.com/v21.0'

/** A post is due for the 1 h snapshot from 55 min on, and for the 24 h snapshot from 23 h on (until 48 h). */
export function dueWindow(ageMs: number, metrics: unknown): 'h1' | 'h24' | null {
  const have = (metrics && typeof metrics === 'object' ? (metrics as Record<string, unknown>) : {}) as Record<string, unknown>
  const min = 60_000
  if (ageMs >= 23 * 60 * min && ageMs <= 48 * 60 * min && !have.h24) return 'h24'
  if (ageMs >= 55 * min && ageMs < 23 * 60 * min && !have.h1) return 'h1'
  return null
}

async function getJson(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<{ ok: boolean; body: any }> {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(20_000) })
  return { ok: res.ok, body: await res.json().catch(() => ({})) }
}

function graphError(body: any): string {
  return String(body?.error?.message ?? 'request failed').slice(0, 200)
}

export async function fetchInstagramMetrics(mediaId: string, token: string, fetchFn: FetchFn = fetch): Promise<MetricValues> {
  const out: MetricValues = {}
  const base = await getJson(fetchFn, `${GRAPH}/${mediaId}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`)
  if (base.ok) {
    out.likes = Number(base.body.like_count ?? 0)
    out.comments = Number(base.body.comments_count ?? 0)
  } else {
    out.error = graphError(base.body)
  }
  const ins = await getJson(fetchFn, `${GRAPH}/${mediaId}/insights?metric=reach,saved,shares&access_token=${encodeURIComponent(token)}`)
  if (ins.ok) {
    for (const m of ins.body.data ?? []) {
      const v = Number(m.values?.[0]?.value ?? m.total_value?.value ?? 0)
      if (m.name === 'reach') out.reach = v
      if (m.name === 'saved') out.saves = v
      if (m.name === 'shares') out.shares = v
    }
  } else {
    out.insightsError = graphError(ins.body)
  }
  return out
}

/**
 * Facebook photo posts used to be stored under the photo id, a node that has no reactions, shares or insights
 * ("Tried accessing nonexisting field"). page_story_id turns it into the post id; ids that already have an
 * underscore are post ids.
 */
async function resolveFacebookPostId(fetchFn: FetchFn, id: string, token: string): Promise<string> {
  if (id.includes('_')) return id
  const r = await getJson(fetchFn, `${GRAPH}/${id}?fields=page_story_id&access_token=${encodeURIComponent(token)}`)
  return r.ok && typeof r.body?.page_story_id === 'string' ? r.body.page_story_id : id
}

/** Reach: the current metric first, the one Meta retired as fallback; a bad metric name must not hide the others */
const FB_REACH_METRICS = ['post_total_media_view_unique', 'post_impressions_unique']

export async function fetchFacebookMetrics(rawId: string, token: string, fetchFn: FetchFn = fetch): Promise<MetricValues> {
  const out: MetricValues = {}
  const postId = await resolveFacebookPostId(fetchFn, rawId, token)
  const base = await getJson(
    fetchFn,
    `${GRAPH}/${postId}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares&access_token=${encodeURIComponent(token)}`,
  )
  if (base.ok) {
    out.reactions = Number(base.body.reactions?.summary?.total_count ?? 0)
    out.comments = Number(base.body.comments?.summary?.total_count ?? 0)
    out.shares = Number(base.body.shares?.count ?? 0)
  } else {
    // e.g. "(#10) requires pages_read_user_content": the Meta token needs more permissions
    out.error = graphError(base.body)
  }
  let insightsError: string | undefined
  const insight = async (metric: string): Promise<number | undefined> => {
    const r = await getJson(fetchFn, `${GRAPH}/${postId}/insights?metric=${metric}&access_token=${encodeURIComponent(token)}`)
    if (!r.ok) {
      insightsError = graphError(r.body)
      return undefined
    }
    const m = (r.body.data ?? []).find((x: { name: string }) => x.name === metric)
    return m ? Number(m.values?.[0]?.value ?? 0) : undefined
  }
  for (const metric of FB_REACH_METRICS) {
    const v = await insight(metric)
    if (v !== undefined) {
      out.reach = v
      break
    }
  }
  const clicks = await insight('post_clicks')
  if (clicks !== undefined) out.linkClicks = clicks
  if (insightsError && out.reach === undefined && out.linkClicks === undefined) out.insightsError = insightsError
  return out
}

export type XCreds = { consumerKey: string; consumerSecret: string; accessToken: string; accessTokenSecret: string }

async function xGet(path: string, query: Record<string, string>, creds: XCreds, fetchFn: FetchFn) {
  const url = `https://api.twitter.com${path}`
  const auth = buildOAuthHeader('GET', url, creds, {}, query)
  return getJson(fetchFn, `${url}?${new URLSearchParams(query).toString()}`, { headers: { Authorization: auth } })
}

export async function fetchXMetrics(tweetId: string, creds: XCreds, fetchFn: FetchFn = fetch): Promise<MetricValues> {
  const r = await xGet(`/2/tweets/${tweetId}`, { 'tweet.fields': 'public_metrics' }, creds, fetchFn)
  if (!r.ok) return { error: String(r.body?.detail ?? r.body?.title ?? 'request failed').slice(0, 200) }
  const m = r.body?.data?.public_metrics ?? {}
  return {
    impressions: Number(m.impression_count ?? 0),
    likes: Number(m.like_count ?? 0),
    comments: Number(m.reply_count ?? 0),
    shares: Number(m.retweet_count ?? 0) + Number(m.quote_count ?? 0),
  }
}

export async function fetchFollowers(
  env: WorkerEnv,
  fetchFn: FetchFn = fetch,
): Promise<{ counts: Partial<Record<Platform, number>>; errors: string[] }> {
  const counts: Partial<Record<Platform, number>> = {}
  const errors: string[] = []
  if (env.META_PAGE_ID && env.META_PAGE_TOKEN) {
    const r = await getJson(fetchFn, `${GRAPH}/${env.META_PAGE_ID}?fields=followers_count,fan_count&access_token=${encodeURIComponent(env.META_PAGE_TOKEN)}`)
    const n = r.body?.followers_count ?? r.body?.fan_count
    if (r.ok && typeof n === 'number') counts.facebook = n
    else errors.push(`facebook: ${graphError(r.body)}`)
  }
  if (env.IG_USER_ID && env.META_PAGE_TOKEN) {
    const r = await getJson(fetchFn, `${GRAPH}/${env.IG_USER_ID}?fields=followers_count&access_token=${encodeURIComponent(env.META_PAGE_TOKEN)}`)
    if (r.ok && typeof r.body?.followers_count === 'number') counts.instagram = r.body.followers_count
    else errors.push(`instagram: ${graphError(r.body)}`)
  }
  const creds = xCreds(env)
  if (creds) {
    const r = await xGet('/2/users/me', { 'user.fields': 'public_metrics' }, creds, fetchFn)
    const n = r.body?.data?.public_metrics?.followers_count
    if (r.ok && typeof n === 'number') counts.x = n
    else errors.push(`x: ${String(r.body?.detail ?? r.body?.title ?? 'request failed').slice(0, 120)}`)
  }
  return { counts, errors }
}

export function xCreds(env: WorkerEnv): XCreds | null {
  return env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET
    ? { consumerKey: env.X_API_KEY, consumerSecret: env.X_API_SECRET, accessToken: env.X_ACCESS_TOKEN, accessTokenSecret: env.X_ACCESS_SECRET }
    : null
}

const pktDate = (now: number) => new Date(now + 5 * 3_600_000).toISOString().slice(0, 10)

/** Every 30 min: snapshot posts that reached 1 h / 24 h, and once a day store the follower counts. */
export async function runSocialMetrics(deps: { env: WorkerEnv; payload: PayloadClient; fetchFn?: FetchFn; now?: number }) {
  const fetchFn = deps.fetchFn ?? fetch
  const now = deps.now ?? Date.now()
  const done = { h1: 0, h24: 0, errors: 0, followers: false }
  const { posts } = await deps.payload.getRecentSocialPosts50h()
  for (const p of posts) {
    const window = dueWindow(now - Date.parse(p.postedAt), p.metrics)
    if (!window) continue
    let data: MetricValues | null = null
    try {
      if (p.platform === 'instagram' && deps.env.META_PAGE_TOKEN) data = await fetchInstagramMetrics(p.externalId, deps.env.META_PAGE_TOKEN, fetchFn)
      else if (p.platform === 'facebook' && deps.env.META_PAGE_TOKEN) data = await fetchFacebookMetrics(p.externalId, deps.env.META_PAGE_TOKEN, fetchFn)
      else if (p.platform === 'x') {
        const creds = xCreds(deps.env)
        if (creds) data = await fetchXMetrics(p.externalId, creds, fetchFn)
      }
    } catch (e) {
      data = { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
    }
    if (!data) continue
    if (data.error) done.errors++
    await deps.payload.putSocialMetrics(p.id, window, data)
    done[window]++
  }

  const today = pktDate(now)
  const seen = await deps.payload.getFollowers(1).catch(() => ({ followers: [] as { date: string }[] }))
  const complete = seen.followers.some((f) => f.date === today)
  if (!complete) {
    const f = await fetchFollowers(deps.env, fetchFn)
    if (Object.keys(f.counts).length) {
      await deps.payload.putFollowers({ date: today, ...f.counts })
      done.followers = true
    }
    if (f.errors.length) logger.warn({ errors: f.errors }, 'follower counts incomplete')
  }
  return done
}
