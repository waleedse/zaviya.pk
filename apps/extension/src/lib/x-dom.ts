import type { XPost, XTrend } from '@zaviya/shared'
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
        createdAt: article.querySelector('time')?.getAttribute('datetime') ?? new Date().toISOString(),
        mediaUrls,
      }),
    )
  }
  return posts
}

export async function postTweet(
  text: string,
  image: { base64: string; type: string; name: string } | undefined,
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

  const findEditor = () =>
    document.querySelector('[data-testid="tweetTextarea_0"]') ??
    document.querySelector('[data-testid="tweetTextarea_1"]') ??
    document.querySelector('div[contenteditable="true"][role="textbox"]')
  // The composer modal renders a moment after the Post button is clicked
  const editorDeadline = Date.now() + 10_000
  while (!findEditor() && Date.now() < editorDeadline) await new Promise((r) => setTimeout(r, 400))
  const editor = findEditor()
  if (!(editor instanceof HTMLElement)) throw new Error(`composer_not_found (${pageState()})`)

  editor.focus()
  document.execCommand('insertText', false, text)
  await randomDelay(delayMinMs, delayMaxMs)

  if (image) {
    const input = document.querySelector('input[data-testid="fileInput"]') ?? document.querySelector('input[type="file"][accept*="image"]')
    if (input instanceof HTMLInputElement) {
      const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], image.name, { type: image.type }))
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      // Wait for the attachment preview so Post does not go out before the image is ready
      const ready = Date.now() + 15_000
      while (!document.querySelector('[data-testid="attachments"] img, [data-testid="attachments"] [role="img"]') && Date.now() < ready) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  const findPostBtn = () =>
    (document.querySelector('[data-testid="tweetButton"]') ?? document.querySelector('[data-testid="tweetButtonInline"]')) as HTMLElement | null
  if (!findPostBtn()) throw new Error('post_button_not_found')

  // The button stays disabled while the image uploads or the link card loads: wait for it instead of clicking a dead button
  await waitFor(() => isEnabled(findPostBtn()), 45_000)
  if (!isEnabled(findPostBtn())) {
    await discardComposer()
    throw new Error(`post_not_sent: Post button stayed disabled${pageMessage() ? ` (${pageMessage()})` : ''}`)
  }

  // Click, then confirm X really sent it: the composer closes or the "Your post was sent" toast shows. One retry.
  for (let attempt = 1; attempt <= 2; attempt++) {
    findPostBtn()?.click()
    const sent = await waitFor(() => !composerOpen() || /your post was sent/i.test(toastText()), 30_000)
    if (sent) {
      await randomDelay(delayMinMs, delayMaxMs)
      // Best-effort: read latest status id from timeline (may not be the new tweet).
      const first = scrapeTimelinePosts(undefined, 1)[0]
      return { externalId: first?.id }
    }
  }
  const why = `${pageMessage() || 'composer still open after clicking Post twice'} (${pageState()})`
  await discardComposer()
  throw new Error(`post_not_sent: ${why}`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await sleep(500)
  }
  return check()
}

function isEnabled(el: HTMLElement | null): boolean {
  return !!el && el.getAttribute('aria-disabled') !== 'true' && !(el as HTMLButtonElement).disabled
}

function composerOpen(): boolean {
  return !!document.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"]')
}

function toastText(): string {
  return (document.querySelector('[data-testid="toast"]') as HTMLElement | null)?.innerText?.trim() ?? ''
}

/**
 * Where the page was when a post failed (ZAV-222): the failure reason in Linear and social-posts can then tell a login wall,
 * a background tab or a changed page apart, instead of just "composer_not_found".
 */
export function pageState(): string {
  const loginWall = !!document.querySelector('[data-testid="loginButton"], a[href="/login"], a[href="/i/flow/login"]')
  const composeBtn = !!(document.querySelector('[data-testid="SideNav_NewTweet_Button"]') ?? document.querySelector('a[href="/compose/post"]'))
  const draft = (document.querySelector('[data-testid="tweetTextarea_0"]') as HTMLElement | null)?.innerText?.length ?? 0
  return [
    `path=${location.pathname.slice(0, 40)}`,
    `tab=${document.visibilityState}`,
    `login_wall=${loginWall ? 'yes' : 'no'}`,
    `compose_btn=${composeBtn ? 'yes' : 'no'}`,
    `draft_chars=${draft}`,
  ].join(' ')
}

/** What X is telling us (error toast, alert, limit notice), so a failure says why. */
function pageMessage(): string {
  const parts = [toastText(), ...Array.from(document.querySelectorAll('[role="alert"], [data-testid="error-detail"]')).map((e) => (e as HTMLElement).innerText?.trim() ?? '')]
  return parts.filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(0, 300)
}

/** Close the composer and discard the draft, so the next job starts clean (and no "Leave site?" dialog appears). */
export async function discardComposer(): Promise<void> {
  if (!composerOpen()) return
  const close = document.querySelector('[data-testid="app-bar-close"], [aria-label="Close"]') as HTMLElement | null
  if (close) close.click()
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(1_000)
  const discard = document.querySelector('[data-testid="confirmationSheetConfirm"]') as HTMLElement | null
  if (discard && /discard/i.test(discard.innerText)) discard.click()
  await sleep(800)
}

/** Trend names from x.com/explore (uses the account's location setting, so set it to Pakistan). */
export function scrapeTrends(limit = 30): XTrend[] {
  const out: XTrend[] = []
  for (const cell of Array.from(document.querySelectorAll('[data-testid="trend"]'))) {
    if (out.length >= limit) break
    const spans = Array.from(cell.querySelectorAll('span'))
      .map((s) => s.textContent?.trim() ?? '')
      .filter((t) => t && t !== '·')
    // Typical order: "1", "Trending in Pakistan", "#Name", "12.3K posts"
    const name = spans.find((t) => /^#/.test(t)) ?? spans.find((t) => !/^\d+$/.test(t) && !/trending|posts$/i.test(t))
    if (!name) continue
    out.push({
      name,
      context: spans.find((t) => /trending/i.test(t)),
      postsLabel: spans.find((t) => /posts$/i.test(t)),
    })
  }
  return out
}

/** Wait until at least one tweet (or trend) has rendered. */
export async function waitForSelector(selector: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (document.querySelector(selector)) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
