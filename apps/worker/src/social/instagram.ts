import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { socialIdempotencyKey } from '../lib/idempotency.js'
import { logger } from '../logger.js'
import { pickCard, withLink } from './link.js'

type PublishingLimit = { data?: { quota_usage?: number; config?: { quota_total?: number } }[] }

/**
 * Room left in Instagram's rolling 24 h API publishing quota (100 posts for this account). `config` only comes back
 * when asked for in `fields`; without it the old code assumed 50 and stopped posting at the 51st post of the day.
 */
export function hasPublishingRoom(data: PublishingLimit): boolean {
  const usage = data.data?.[0]?.quota_usage ?? 0
  const total = data.data?.[0]?.config?.quota_total ?? 100
  return usage < total
}

async function checkPublishingLimit(igUserId: string, token: string): Promise<boolean> {
  const url = `https://graph.facebook.com/v21.0/${igUserId}/content_publishing_limit?fields=config,quota_usage&access_token=${encodeURIComponent(token)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return true
  return hasPublishingRoom((await res.json()) as PublishingLimit)
}

export async function postInstagram(
  input: { articleId: string; copy: { instagram: string }; mediaUrls: string[]; url?: string },
  deps: { env: WorkerEnv; payload: PayloadClient; postedToday?: number; settingsDailyCap?: number },
): Promise<void> {
  const format = input.mediaUrls.length > 1 ? 'carousel' : 'card'
  const key = socialIdempotencyKey(input.articleId, 'instagram', format)

  if (!deps.env.IG_USER_ID || !deps.env.META_PAGE_TOKEN) {
    logger.debug('Instagram skipped — API not configured')
    return
  }
  if (deps.postedToday !== undefined && deps.settingsDailyCap !== undefined && deps.postedToday >= deps.settingsDailyCap) {
    logger.info('Instagram daily cap reached')
    return
  }
  if (!(await checkPublishingLimit(deps.env.IG_USER_ID, deps.env.META_PAGE_TOKEN))) {
    logger.warn('Instagram content_publishing_limit reached')
    return
  }
  const image = pickCard(input.mediaUrls, 'instagram')
  if (!image) {
    logger.warn('Instagram requires media URL')
    return
  }

  try {
    const createUrl = `https://graph.facebook.com/v21.0/${deps.env.IG_USER_ID}/media`
    const createBody = new URLSearchParams({
      image_url: image,
      caption: withLink(input.copy.instagram, input.url, 'instagram'),
      access_token: deps.env.META_PAGE_TOKEN,
    })
    const createRes = await fetch(createUrl, { method: 'POST', body: createBody })
    const created = (await createRes.json()) as { id?: string; error?: { message?: string; code?: number; error_user_msg?: string } }
    // Keep Meta's reason (e.g. "The Instagram account is restricted.", code 25) so the Control Room shows it
    if (!created.id) {
      const why = created.error?.error_user_msg ?? created.error?.message ?? `HTTP ${createRes.status}`
      throw new Error(`IG container create failed: ${why}${created.error?.code ? ` (code ${created.error.code})` : ''}`)
    }

    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const statusUrl = `https://graph.facebook.com/v21.0/${created.id}?fields=status_code&access_token=${encodeURIComponent(deps.env.META_PAGE_TOKEN)}`
      const st = await fetch(statusUrl)
      const stData = (await st.json()) as { status_code?: string }
      if (stData.status_code === 'FINISHED') break
      if (stData.status_code === 'ERROR') throw new Error('IG container error')
    }

    const pubUrl = `https://graph.facebook.com/v21.0/${deps.env.IG_USER_ID}/media_publish`
    const pubBody = new URLSearchParams({ creation_id: created.id!, access_token: deps.env.META_PAGE_TOKEN })
    const pubRes = await fetch(pubUrl, { method: 'POST', body: pubBody })
    const pub = (await pubRes.json()) as { id?: string }

    await deps.payload.upsertSocialPost({
      idempotencyKey: key,
      article: input.articleId,
      platform: 'instagram',
      format,
      copy: input.copy.instagram,
      mediaUrls: input.mediaUrls,
      status: pubRes.ok ? 'posted' : 'failed',
      externalId: pub.id,
      via: 'api',
      postedAt: pubRes.ok ? new Date().toISOString() : undefined,
    })
  } catch (e) {
    logger.warn({ err: e }, 'Instagram post failed')
    await deps.payload.upsertSocialPost({
      idempotencyKey: key,
      article: input.articleId,
      platform: 'instagram',
      format,
      copy: input.copy.instagram,
      mediaUrls: input.mediaUrls,
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
