import type { PlatformKey } from './storage'

const PLATFORM_PATTERNS: Record<PlatformKey, RegExp[]> = {
  x: [/^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i],
  instagram: [/^https?:\/\/(www\.)?instagram\.com\//i],
  facebook: [/^https?:\/\/(www\.)?facebook\.com\//i, /^https?:\/\/(www\.)?web\.facebook\.com\//i],
  gemini: [/^https?:\/\/gemini\.google\.com\//i],
}

export async function scanOpenPlatforms(): Promise<Record<PlatformKey, boolean>> {
  const tabs = await chrome.tabs.query({})
  const out: Record<PlatformKey, boolean> = { x: false, instagram: false, facebook: false, gemini: false }
  for (const tab of tabs) {
    const url = tab.url ?? ''
    for (const key of Object.keys(PLATFORM_PATTERNS) as PlatformKey[]) {
      if (PLATFORM_PATTERNS[key].some((re) => re.test(url))) out[key] = true
    }
  }
  return out
}

export async function findTabForPlatform(platform: PlatformKey): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({})
  return tabs.find((t) => {
    const url = t.url ?? ''
    return PLATFORM_PATTERNS[platform].some((re) => re.test(url))
  })
}

export async function ensureTab(url: string, platform: PlatformKey): Promise<number> {
  // Reuses the platform's tab (navigating it) so automation never piles up tabs.
  const existing = await findTabForPlatform(platform)
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { url })
    await waitForTabLoad(existing.id)
    return existing.id
  }
  const created = await chrome.tabs.create({ url, active: false })
  if (created.id === undefined) throw new Error('failed to create tab')
  await waitForTabLoad(created.id)
  return created.id
}

/**
 * Heavy single-page apps (X, Gemini) often never report "complete" in a background tab.
 * Wait up to the timeout, then carry on: the content script waits for the elements it needs.
 */
function waitForTabLoad(tabId: number, timeoutMs = 25_000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      // Small settle time for client-side rendering.
      setTimeout(resolve, 2_500)
    }
    const timer = setTimeout(done, timeoutMs)
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done()
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

/** Content scripts load after navigation; retry until one answers. */
export async function sendToTab<T>(tabId: number, message: unknown, attempts = 8, replyTimeoutMs = 240_000): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      // A content script that died mid-task never answers; don't let one job hang the queue forever.
      return (await withTimeout(chrome.tabs.sendMessage(tabId, message) as Promise<T>, replyTimeoutMs, 'content_script_no_reply')) as T
    } catch (e) {
      if (e instanceof Error && e.message === 'content_script_no_reply') throw e
      lastErr = e
      await new Promise((r) => setTimeout(r, 2_000))
    }
  }
  throw new Error(`content_script_unreachable: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms)
    }),
  ])
}
