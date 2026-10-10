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
