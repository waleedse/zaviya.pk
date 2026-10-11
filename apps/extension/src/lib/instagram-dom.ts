import type { InstagramPostRef } from '@zaviya/shared'
import { randomDelay } from './delay'

export function detectCheckpoint(): boolean {
  const body = document.body?.innerText ?? ''
  return /confirm your identity|suspicious|captcha|try again later/i.test(body)
}

/** Best-effort Instagram post — UI changes often; requires logged-in session. */
export async function postInstagram(
  caption: string,
  mediaUrls: string[],
  delayMinMs: number,
  delayMaxMs: number,
): Promise<{ externalId?: string }> {
  if (detectCheckpoint()) throw new Error('checkpoint_detected')
  if (!mediaUrls.length) throw new Error('instagram_requires_media')

  // TODO: download mediaUrls and attach via file input — not implemented without host permission fetch + File API.
  const createLink = Array.from(document.querySelectorAll('a, svg')).find((el) => {
    const label = el.getAttribute('aria-label') ?? ''
    return /new post|create/i.test(label)
  })
  if (createLink instanceof HTMLElement) {
    createLink.click()
    await randomDelay(delayMinMs, delayMaxMs)
  } else {
    throw new Error('instagram_create_not_found')
  }

  const captionBox = document.querySelector('textarea[aria-label*="caption" i], textarea[placeholder*="caption" i]')
  if (captionBox instanceof HTMLTextAreaElement) {
    captionBox.value = caption
    captionBox.dispatchEvent(new Event('input', { bubbles: true }))
    await randomDelay(delayMinMs, delayMaxMs)
  }

  throw new Error('instagram_media_upload_not_implemented')
}

/** Recent post links from a profile grid. Captions come from image alt text when Instagram provides it. */
export async function readProfile(username: string, limit = 9): Promise<InstagramPostRef[]> {
  if (detectCheckpoint()) throw new Error('checkpoint_detected')
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline && !document.querySelector('a[href*="/p/"], a[href*="/reel/"]')) {
    await new Promise((r) => setTimeout(r, 500))
  }
  const out: InstagramPostRef[] = []
  const seen = new Set<string>()
  for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]'))) {
    const m = a.getAttribute('href')?.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/)
    if (!m || seen.has(m[2]!)) continue
    seen.add(m[2]!)
    const alt = a.querySelector('img')?.getAttribute('alt') ?? ''
    out.push({
      shortcode: m[2]!,
      url: `https://www.instagram.com/${m[1]}/${m[2]}/`,
      caption: alt.replace(/^Photo (by|shared by) [^.]+\.?\s*/i, '').trim(),
      username,
    })
    if (out.length >= limit) break
  }
  return out
}
