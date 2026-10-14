import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { socialIdempotencyKey } from '../lib/idempotency.js'
import { logger } from '../logger.js'
import { pickCard, withLink } from './link.js'
import type { BridgeServer } from '../bridge/server.js'

export async function postFacebook(
  input: { articleId: string; copy: { facebook: string }; mediaUrls: string[]; url?: string; format?: 'link' | 'card' },
  deps: { env: WorkerEnv; payload: PayloadClient; bridge?: BridgeServer; settingsDailyCap?: number; postedToday?: number },
): Promise<void> {
  const format = input.format ?? (input.mediaUrls.length ? 'card' : 'link')
  const key = socialIdempotencyKey(input.articleId, 'facebook', format)
  const message = withLink(input.copy.facebook, input.url, 'facebook')
  if (deps.postedToday !== undefined && deps.settingsDailyCap !== undefined && deps.postedToday >= deps.settingsDailyCap) {
    logger.info('Facebook daily cap reached — skipping')
    return
  }

  if (deps.env.META_PAGE_ID && deps.env.META_PAGE_TOKEN) {
    try {
      // A photo post (the headline card) with the link in the caption stops the scroll;
      // without a card, a plain link post still shows the article preview
      const card = pickCard(input.mediaUrls, 'facebook')
      const url = `https://graph.facebook.com/v21.0/${deps.env.META_PAGE_ID}/${card ? 'photos' : 'feed'}`
      const body = new URLSearchParams(
        card
          ? { url: card, caption: message, access_token: deps.env.META_PAGE_TOKEN }
          : { message, ...(input.url ? { link: input.url } : {}), access_token: deps.env.META_PAGE_TOKEN },
      )
      const res = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(20_000) })
      const data = (await res.json()) as { id?: string; error?: { message: string } }
      await deps.payload.upsertSocialPost({
        idempotencyKey: key,
        article: input.articleId,
        platform: 'facebook',
        format,
        copy: message,
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
