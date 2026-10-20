import type { WorkerEnv } from '../config.js'
import type { PayloadClient } from '../payload-client.js'
import { socialIdempotencyKey } from '../lib/idempotency.js'
import { logger } from '../logger.js'
import { captionWithoutLink, limitHashtags, pickCard, withLink } from './link.js'
import type { BridgeServer } from '../bridge/server.js'

const GRAPH = 'https://graph.facebook.com/v21.0'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * ZAV-111: the article link goes in the Page's first comment, because Facebook shows posts without a link to more people.
 * Tried three times (now, 3 s, 10 s) so the link is there within a minute; returns an error text when it never got posted.
 */
/**
 * ZAV-138: when the Page token lacks comment rights (#200) every first comment fails and the post would carry no link.
 * After one such failure we skip the comment for a while and keep the link in the caption; after the pause the next
 * post tries the comment again, so link-in-comment returns by itself once the token has the scope.
 */
export const COMMENT_BLOCK_MS = 6 * 60 * 60 * 1000
let commentBlockedUntil = 0
export const commentsBlocked = (now = Date.now()) => now < commentBlockedUntil
export const resetCommentBlock = () => void (commentBlockedUntil = 0)
export const isPermissionError = (err: string) => /\(code 200\)|\(#200\)|permission/i.test(err)

/** Appends the article link to an already published post (needs pages_manage_posts only). Returns an error text on failure. */
export async function appendLinkToPost(
  postId: string,
  caption: string,
  link: string,
  token: string,
  opts: { fetchFn?: typeof fetch } = {},
): Promise<string | undefined> {
  try {
    const res = await (opts.fetchFn ?? fetch)(`${GRAPH}/${postId}`, {
      method: 'POST',
      body: new URLSearchParams({ message: withLink(caption, link, 'facebook'), access_token: token }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }
    if (res.ok && data.error === undefined) return undefined
    return data.error?.message ?? `HTTP ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export async function postFirstComment(
  postId: string,
  link: string,
  token: string,
  opts: { fetchFn?: typeof fetch; waitMs?: number[] } = {},
): Promise<string | undefined> {
  const fetchFn = opts.fetchFn ?? fetch
  const waits = opts.waitMs ?? [0, 3_000, 10_000]
  let last = 'unknown error'
  for (const wait of waits) {
    if (wait) await sleep(wait)
    try {
      const res = await fetchFn(`${GRAPH}/${postId}/comments`, {
        method: 'POST',
        body: new URLSearchParams({ message: link, access_token: token }),
        signal: AbortSignal.timeout(15_000),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string; code?: number } }
      if (res.ok && data.id) return undefined
      last = `${data.error?.message ?? `HTTP ${res.status}`}${data.error?.code ? ` (code ${data.error.code})` : ''}`
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
  }
  return last
}

export async function postFacebook(
  input: { articleId: string; copy: { facebook: string }; mediaUrls: string[]; url?: string; format?: 'link' | 'card' },
  deps: { env: WorkerEnv; payload: PayloadClient; bridge?: BridgeServer; settingsDailyCap?: number; postedToday?: number; commentWaitMs?: number[] },
): Promise<void> {
  const format = input.format ?? (input.mediaUrls.length ? 'card' : 'link')
  const key = socialIdempotencyKey(input.articleId, 'facebook', format)
  const copy = limitHashtags(input.copy.facebook, 2)
  // With a card the link goes in the first comment (FB_LINK_IN_COMMENT); a card-less link post keeps its preview instead
  // ...unless comments are known to fail (#200): then the link stays in the caption until the pause ends
  const linkInComment =
    deps.env.FB_LINK_IN_COMMENT !== false && !commentsBlocked() && Boolean(input.url) && Boolean(pickCard(input.mediaUrls, 'facebook'))
  let message = linkInComment ? captionWithoutLink(copy, input.url) : withLink(copy, input.url, 'facebook')
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
      const data = (await res.json()) as { id?: string; post_id?: string; error?: { message: string } }
      let error = data.error?.message
      if (res.ok && linkInComment && input.url) {
        // /photos answers with the photo id and the post id; comments belong on the post
        const commentError = await postFirstComment(data.post_id ?? data.id ?? '', input.url, deps.env.META_PAGE_TOKEN, { waitMs: deps.commentWaitMs })
        if (commentError) {
          error = `link comment failed: ${commentError}`.slice(0, 300)
          logger.warn({ articleId: input.articleId, error: commentError }, 'Facebook first comment failed')
          if (isPermissionError(commentError)) {
            commentBlockedUntil = Date.now() + COMMENT_BLOCK_MS
            logger.warn('Facebook comments lack permission (#200): link goes in the caption for the next 6h')
          }
          // fallback: edit the post so the article link is not lost
          const editError = await appendLinkToPost(data.post_id ?? data.id ?? '', copy, input.url, deps.env.META_PAGE_TOKEN)
          if (editError) logger.warn({ articleId: input.articleId, error: editError }, 'Facebook caption link fallback failed')
          else {
            message = withLink(copy, input.url, 'facebook')
            logger.info({ articleId: input.articleId }, 'Facebook link added to the caption after the comment failed')
          }
        }
      }
      await deps.payload.upsertSocialPost({
        idempotencyKey: key,
        article: input.articleId,
        platform: 'facebook',
        format,
        copy: message,
        mediaUrls: input.mediaUrls,
        status: res.ok ? 'posted' : 'failed',
        // the post id (page_post), not the photo id: reactions and insights are read from it
        externalId: data.post_id ?? data.id,
        via: 'api',
        error,
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
