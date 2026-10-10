import type { XPost } from '@zaviya/shared'
import { XPostSchema } from '@zaviya/shared'
import { randomDelay } from './delay'

export function detectCheckpoint(): boolean {
  const body = document.body?.innerText ?? ''
  return /unusual activity|account locked|verify you are human|captcha/i.test(body)
}

export function scrapeTimelinePosts(sinceId?: string, limit = 30): XPost[] {
  const articles = document.querySelectorAll('article[data-testid="tweet"]')
  const posts: XPost[] = []
  for (const article of articles) {
    if (posts.length >= limit) break
    const statusLink = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null
    const href = statusLink?.href ?? ''
    const idMatch = href.match(/status\/(\d+)/)
    const id = idMatch?.[1]
    if (!id) continue
    if (sinceId) {
      try {
        if (BigInt(id) <= BigInt(sinceId)) continue
      } catch {
        /* ignore compare errors */
      }
    }
    const textEl = article.querySelector('[data-testid="tweetText"]')
    const text = textEl?.textContent?.trim() ?? ''
    const userLink = article.querySelector('a[href^="/"][role="link"]') as HTMLAnchorElement | null
    const author = userLink?.href?.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').split('/')[0] ?? 'unknown'
    const mediaUrls = Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media"]')).map(
      (img) => (img as HTMLImageElement).src,
    )
    posts.push(
      XPostSchema.parse({
        id,
        author,
        text,
        url: `https://x.com/i/web/status/${id}`,
        createdAt: new Date().toISOString(),
        mediaUrls,
      }),
    )
  }
  return posts
}

export async function postTweet(
  text: string,
  _mediaUrls: string[],
  delayMinMs: number,
  delayMaxMs: number,
): Promise<{ externalId?: string }> {
  if (detectCheckpoint()) throw new Error('checkpoint_detected')

  const compose =
    document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ??
    document.querySelector('a[href="/compose/post"]')
  if (compose instanceof HTMLElement) {
    compose.click()
    await randomDelay(delayMinMs, delayMaxMs)
  }

  const editor =
    document.querySelector('[data-testid="tweetTextarea_0"]') ??
    document.querySelector('[data-testid="tweetTextarea_1"]') ??
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  if (!(editor instanceof HTMLElement)) throw new Error('composer_not_found')

  editor.focus()
  document.execCommand('insertText', false, text)
  await randomDelay(delayMinMs, delayMaxMs)

  const postBtn =
    document.querySelector('[data-testid="tweetButton"]') ??
    document.querySelector('[data-testid="tweetButtonInline"]')
  if (!(postBtn instanceof HTMLElement)) throw new Error('post_button_not_found')
  postBtn.click()
  await randomDelay(delayMinMs, delayMaxMs)

  // Best-effort: read latest status id from timeline (may not be the new tweet).
  const first = scrapeTimelinePosts(undefined, 1)[0]
  return { externalId: first?.id }
}
