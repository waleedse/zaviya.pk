import type { ReelResult } from '../social/reels.js'

/** Instagram sometimes fails to process a good file ("ProcessingFailedError", container stuck): one more try after a pause is what a person would do. */
export const RETRY_AFTER_MS = 3 * 60_000
const TRANSIENT = /processing|timed out|ProcessingFailed|temporar|try again|rate/i

export async function postWithRetry(
  post: () => Promise<ReelResult>,
  sleep: (ms: number) => Promise<void>,
  retryAfterMs = RETRY_AFTER_MS,
): Promise<ReelResult> {
  const once = async (): Promise<ReelResult> => {
    try {
      return await post()
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  const first = await once()
  if (first.ok || !TRANSIENT.test(first.error ?? '')) return first
  await sleep(retryAfterMs)
  const second = await once()
  return second.ok ? second : { ok: false, error: `${second.error} (after a retry; first: ${first.error})`.slice(0, 1500) }
}
