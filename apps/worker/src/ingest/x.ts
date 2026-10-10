import type { XPost } from '@zaviya/shared'
import { XPostSchema } from '@zaviya/shared'
import { logger } from '../logger.js'

export async function fetchCuratedTweets(
  userIds: string[],
  bearerToken: string,
  sinceId?: string,
  fetchFn: typeof fetch = fetch,
): Promise<XPost[]> {
  if (!bearerToken || userIds.length === 0) {
    logger.debug('X reader skipped — bearer or user ids missing')
    return []
  }
  const posts: XPost[] = []
  for (const userId of userIds) {
    const params = new URLSearchParams({
      'tweet.fields': 'created_at,author_id',
      max_results: '10',
    })
    if (sinceId) params.set('since_id', sinceId)
    const url = `https://api.twitter.com/2/users/${userId}/tweets?${params}`
    const res = await fetchFn(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      logger.warn({ userId, status: res.status }, 'X API read failed')
      continue
    }
    const data = (await res.json()) as {
      data?: { id: string; text: string; created_at?: string }[]
    }
    for (const t of data.data ?? []) {
      posts.push(
        XPostSchema.parse({
          id: t.id,
          author: userId,
          text: t.text,
          url: `https://x.com/i/web/status/${t.id}`,
          createdAt: t.created_at ?? new Date().toISOString(),
          mediaUrls: [],
        }),
      )
    }
  }
  return posts
}

export function parseBridgeXPosts(raw: unknown[]): XPost[] {
  return raw.map((r) => XPostSchema.parse(r))
}
