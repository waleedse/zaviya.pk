import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { socialIdempotencyKey } from '../lib/idempotency.js'
import { buildOAuthHeader } from './x-oauth.js'
import { logger } from '../logger.js'
import { withLink } from './link.js'
import type { BridgeServer } from '../bridge/server.js'
import type { Priority } from '@zaviya/shared'

export async function postX(
  input: {
    articleId: string
    copy: { x: string }
    url?: string
    priority: Priority
    mediaUrls?: string[]
  },
  deps: { env: WorkerEnv; payload: PayloadClient; bridge?: BridgeServer },
): Promise<void> {
  const format = input.url ? 'link' : 'text'
  const key = socialIdempotencyKey(input.articleId, 'x', format)
  const text = withLink(input.copy.x, input.url, 'x')

  const creds =
    deps.env.X_API_KEY &&
    deps.env.X_API_SECRET &&
    deps.env.X_ACCESS_TOKEN &&
    deps.env.X_ACCESS_SECRET
      ? {
          consumerKey: deps.env.X_API_KEY,
          consumerSecret: deps.env.X_API_SECRET,
          accessToken: deps.env.X_ACCESS_TOKEN,
          accessTokenSecret: deps.env.X_ACCESS_SECRET,
        }
      : null

  if (creds) {
    try {
      const url = 'https://api.twitter.com/2/tweets'
      const auth = buildOAuthHeader('POST', url, creds)
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(20_000),
      })
      const data = (await res.json()) as { data?: { id: string }; detail?: string }
      await deps.payload.upsertSocialPost({
        idempotencyKey: key,
        article: input.articleId,
        platform: 'x',
        format,
        copy: text,
        mediaUrls: input.mediaUrls ?? [],
        status: res.ok ? 'posted' : 'failed',
        externalId: data.data?.id,
        via: 'api',
        error: data.detail,
        postedAt: res.ok ? new Date().toISOString() : undefined,
      })
      return
    } catch (e) {
      logger.warn({ err: e }, 'X API post failed')
    }
  }

  if (deps.bridge?.isConnected('x')) {
    try {
      const result = await deps.bridge.send({ id: key, type: 'x.post', payload: { text, mediaUrls: input.mediaUrls ?? [] } })
      const externalId = (result as { externalId?: string }).externalId
      await deps.payload.upsertSocialPost({
        idempotencyKey: key,
        article: input.articleId,
        platform: 'x',
        format,
        copy: text,
        mediaUrls: input.mediaUrls ?? [],
        status: 'posted',
        externalId,
        via: 'extension',
        postedAt: new Date().toISOString(),
      })
      return
    } catch (e) {
      logger.warn({ err: e }, 'X bridge post failed')
    }
  }

  logger.debug('X posting skipped — not configured')
}
