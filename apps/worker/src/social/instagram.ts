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

type GraphError = { message?: string; code?: number; error_user_msg?: string }

/** Meta's own words for a failed call, so the Control Room shows why instead of an empty error. */
export function graphErrorText(body: { error?: GraphError } | null | undefined, status: number): string {
  const e = body?.error
  const why = e?.error_user_msg ?? e?.message ?? `HTTP ${status}`
  return `${why}${e?.code ? ` (code ${e.code})` : ''}`
}

type RecentMedia = { id?: string; caption?: string; timestamp?: string }

/** Instagram stamps timestamps as "2026-10-17T21:40:26+0000"; make that parseable everywhere. */
function mediaTime(ts: string | undefined): number {
  return ts ? Date.parse(ts.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN
}

/** A post of ours that is already live: same caption, published after we started. Used when media_publish answers with an error. */
export function findPublishedMedia(media: RecentMedia[], caption: string, since: number): RecentMedia | undefined {
  return media.find((m) => m.id && (m.caption ?? '').trim() === caption.trim() && mediaTime(m.timestamp) >= since - 60_000)
}

export async function postInstagram(
  input: { articleId: string; copy: { instagram: string }; mediaUrls: string[]; url?: string },
  deps: { env: WorkerEnv; payload: PayloadClient; postedToday?: number; settingsDailyCap?: number; sleep?: (ms: number) => Promise<void> },
): Promise<void> {
  // One image goes out (pickCard): the extra URLs are the same card in other sizes, not carousel slides.
  const format = 'card'
  const key = socialIdempotencyKey(input.articleId, 'instagram', format)
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

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

  const caption = withLink(input.copy.instagram, input.url, 'instagram')
  const startedAt = Date.now()
  const token = deps.env.META_PAGE_TOKEN
  try {
    const createUrl = `https://graph.facebook.com/v21.0/${deps.env.IG_USER_ID}/media`
    const createBody = new URLSearchParams({ image_url: image, caption, access_token: token })
    const createRes = await fetch(createUrl, { method: 'POST', body: createBody })
    const created = (await createRes.json()) as { id?: string; error?: GraphError }
    // Keep Meta's reason (e.g. "The Instagram account is restricted.", code 25) so the Control Room shows it
    if (!created.id) throw new Error(`IG container create failed: ${graphErrorText(created, createRes.status)}`)

    // Publishing before the container is FINISHED is rejected, so wait for it (up to ~40 s)
    let finished = false
    for (let i = 0; i < 20 && !finished; i++) {
      await sleep(2000)
      const statusUrl = `https://graph.facebook.com/v21.0/${created.id}?fields=status_code&access_token=${encodeURIComponent(token)}`
      const stData = (await (await fetch(statusUrl)).json()) as { status_code?: string }
      if (stData.status_code === 'FINISHED') finished = true
      else if (stData.status_code === 'ERROR') throw new Error('IG container error')
    }
    if (!finished) throw new Error('IG container was not ready after 40 s')

    const pubUrl = `https://graph.facebook.com/v21.0/${deps.env.IG_USER_ID}/media_publish`
    const pubBody = new URLSearchParams({ creation_id: created.id, access_token: token })
    const pubRes = await fetch(pubUrl, { method: 'POST', body: pubBody })
    const pub = (await pubRes.json().catch(() => ({}))) as { id?: string; error?: GraphError }

    let externalId = pubRes.ok ? pub.id : undefined
    if (!externalId) {
      // media_publish answered with an error, but Instagram often publishes anyway: look for the post before calling it failed (ZAV-114)
      await sleep(3000)
      const listUrl = `https://graph.facebook.com/v21.0/${deps.env.IG_USER_ID}/media?fields=id,caption,timestamp&limit=10&access_token=${encodeURIComponent(token)}`
      const list = (await (await fetch(listUrl)).json().catch(() => ({}))) as { data?: RecentMedia[] }
      externalId = findPublishedMedia(list.data ?? [], caption, startedAt)?.id
      if (!externalId) throw new Error(`IG publish failed: ${graphErrorText(pub, pubRes.status)}`)
      logger.warn({ articleId: input.articleId, igMediaId: externalId, why: graphErrorText(pub, pubRes.status) }, 'Instagram publish answered with an error but the post is live')
    }

    await deps.payload.upsertSocialPost({
      idempotencyKey: key,
      article: input.articleId,
      platform: 'instagram',
      format,
      copy: input.copy.instagram,
      mediaUrls: input.mediaUrls,
      status: 'posted',
      externalId,
      via: 'api',
      postedAt: new Date().toISOString(),
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
