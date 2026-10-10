import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { socialIdempotencyKey } from '../lib/idempotency.js'
import { logger } from '../logger.js'
import type { BridgeServer } from '../bridge/server.js'

export async function postFacebook(
  input: { articleId: string; copy: { facebook: string }; mediaUrls: string[]; format?: 'link' | 'card' },
  deps: { env: WorkerEnv; payload: PayloadClient; bridge?: BridgeServer; settingsDailyCap?: number; postedToday?: number },
): Promise<void> {
  const format = input.format ?? (input.mediaUrls.length ? 'card' : 'link')
  const key = socialIdempotencyKey(input.articleId, 'facebook', format)
  if (deps.postedToday !== undefined && deps.settingsDailyCap !== undefined && deps.postedToday >= deps.settingsDailyCap) {
    logger.info('Facebook daily cap reached — skipping')
    return
  }

  if (deps.env.META_PAGE_ID && deps.env.META_PAGE_TOKEN) {
    try {
      const url = `https://graph.facebook.com/v21.0/${deps.env.META_PAGE_ID}/feed`
      const body = new URLSearchParams({
        message: input.copy.facebook,
        access_token: deps.env.META_PAGE_TOKEN,
      })
      const res = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(20_000) })
      const data = (await res.json()) as { id?: string; error?: { message: string } }
      await deps.payload.upsertSocialPost({
        idempotencyKey: key,
        article: input.articleId,
        platform: 'facebook',
        format,
        copy: input.copy.facebook,
        mediaUrls: input.mediaUrls,
        status: res.ok ? 'posted' : 'failed',
        externalId: data.id,
        via: 'api',
        error: data.error?.message,
        postedAt: res.ok ? new Date().toISOString() : undefined,
      })
      return
    } catch (e) {
      logger.warn({ err: e }, 'Facebook API failed')
    }
  }

  if (deps.bridge?.isConnected('facebook')) {
    logger.debug('Facebook extension fallback not implemented in bridge job types')
  } else {
    logger.debug('Facebook posting skipped — not configured')
  }
}
