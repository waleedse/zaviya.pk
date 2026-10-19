import { describe, expect, it } from 'vitest'
import { dueWindow, fetchFacebookMetrics, fetchFollowers, fetchInstagramMetrics, fetchXMetrics } from './metrics.js'
import type { WorkerEnv } from '../config.js'

const MIN = 60_000
const reply = (routes: Record<string, { ok?: boolean; body: unknown }>) =>
  (async (input: unknown) => {
    const url = String(input)
    const key = Object.keys(routes).find((k) => url.includes(k))
    const r = key ? routes[key]! : { ok: false, body: { error: { message: 'no route' } } }
    return { ok: r.ok ?? true, json: async () => r.body } as Response
  }) as unknown as typeof fetch

describe('dueWindow', () => {
  it('takes the 1 h snapshot from 55 minutes and the 24 h one from 23 hours', () => {
    expect(dueWindow(30 * MIN, null)).toBeNull()
    expect(dueWindow(60 * MIN, null)).toBe('h1')
    expect(dueWindow(60 * MIN, { h1: { likes: 1 } })).toBeNull()
    expect(dueWindow(24 * 60 * MIN, { h1: {} })).toBe('h24')
    expect(dueWindow(24 * 60 * MIN, { h1: {}, h24: {} })).toBeNull()
    expect(dueWindow(49 * 60 * MIN, null)).toBeNull()
  })
})

describe('fetchers', () => {
  it('reads Instagram likes, comments and reach', async () => {
    const f = reply({
      '/insights': { body: { data: [{ name: 'reach', values: [{ value: 40 }] }, { name: 'saved', values: [{ value: 2 }] }, { name: 'shares', values: [{ value: 1 }] }] } },
      '/123?': { body: { like_count: 3, comments_count: 1 } },
    })
    expect(await fetchInstagramMetrics('123', 't', f)).toEqual({ likes: 3, comments: 1, reach: 40, saves: 2, shares: 1 })
  })
  it('keeps the Facebook permission error instead of failing', async () => {
    const f = reply({
      '/insights': { ok: false, body: { error: { message: '(#10) requires read_insights' } } },
      '/9_1?': { ok: false, body: { error: { message: '(#10) requires pages_read_user_content' } } },
    })
    const m = await fetchFacebookMetrics('9_1', 't', f)
    expect(m.error).toContain('pages_read_user_content')
    expect(m.insightsError).toContain('read_insights')
  })
  it('reads Facebook reactions, reach and clicks', async () => {
    const f = reply({
      '/insights': { body: { data: [{ name: 'post_impressions_unique', values: [{ value: 90 }] }, { name: 'post_clicks', values: [{ value: 7 }] }] } },
      '/9_1?': { body: { reactions: { summary: { total_count: 5 } }, comments: { summary: { total_count: 2 } }, shares: { count: 1 } } },
    })
    expect(await fetchFacebookMetrics('9_1', 't', f)).toEqual({ reactions: 5, comments: 2, shares: 1, reach: 90, linkClicks: 7 })
  })
  const creds = { consumerKey: 'a', consumerSecret: 'b', accessToken: 'c', accessTokenSecret: 'd' }
  it('reads X public_metrics and reports an auth failure', async () => {
    const ok = reply({ '/2/tweets/55': { body: { data: { public_metrics: { impression_count: 100, like_count: 4, reply_count: 1, retweet_count: 2, quote_count: 1 } } } } })
    expect(await fetchXMetrics('55', creds, ok)).toEqual({ impressions: 100, likes: 4, comments: 1, shares: 3 })
    const bad = reply({ '/2/tweets/55': { ok: false, body: { title: 'Unauthorized' } } })
    expect(await fetchXMetrics('55', creds, bad)).toEqual({ error: 'Unauthorized' })
  })
  it('collects follower counts and says which platform failed', async () => {
    const env = { META_PAGE_ID: 'p', IG_USER_ID: 'i', META_PAGE_TOKEN: 't', X_API_KEY: 'a', X_API_SECRET: 'b', X_ACCESS_TOKEN: 'c', X_ACCESS_SECRET: 'd' } as unknown as WorkerEnv
    const f = reply({
      '/p?': { body: { followers_count: 26 } },
      '/i?': { body: { followers_count: 2 } },
      '/2/users/me': { ok: false, body: { title: 'Unauthorized' } },
    })
    const r = await fetchFollowers(env, f)
    expect(r.counts).toEqual({ facebook: 26, instagram: 2 })
    expect(r.errors).toEqual(['x: Unauthorized'])
  })
})
