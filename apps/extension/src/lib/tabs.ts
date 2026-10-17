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
 * Gemini gets its own small window with only its tab, so it can be brought forward for a moment
 * without switching Waleed's tabs: Gemini will not send a message from a hidden tab.
 */
export async function ensureGeminiWindowTab(url: string): Promise<{ tabId: number; windowId: number }> {
  const tabs = await chrome.tabs.query({})
  for (const t of tabs) {
    if (t.id === undefined || !PLATFORM_PATTERNS.gemini.some((re) => re.test(t.url ?? ''))) continue
    const siblings = await chrome.tabs.query({ windowId: t.windowId })
    if (siblings.length === 1) {
      await chrome.tabs.update(t.id, { url })
      await waitForTabLoad(t.id)
      return { tabId: t.id, windowId: t.windowId }
    }
  }
  const win = await chrome.windows.create({ url, focused: false, state: 'normal', width: 480, height: 640, left: 24, top: 24 })
  const tabId = win.tabs?.[0]?.id
  if (tabId === undefined || win.id === undefined) throw new Error('failed to create gemini window')
  await waitForTabLoad(tabId)
  return { tabId, windowId: win.id }
}

/** Brings a window forward for `ms`, then gives focus back to the window Waleed was using. */
export async function showBriefly(windowId: number, ms: number): Promise<void> {
  const prev = await chrome.windows.getLastFocused().catch(() => undefined)
  await chrome.windows.update(windowId, { focused: true, state: 'normal' })
  setTimeout(() => {
    if (prev?.id !== undefined && prev.id !== windowId) void chrome.windows.update(prev.id, { focused: true }).catch(() => undefined)
  }, ms)
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

const OWN_TAB_KEY = (platform: PlatformKey) => `ownTab:${platform}`

/**
 * The extension's own tab for a platform: never one of Waleed's tabs, so a job can leave a draft or navigate away
 * without touching his work. Its id lives in session storage (cleared when Chrome restarts).
 */
export async function ensureOwnTab(url: string, platform: PlatformKey): Promise<number> {
  const key = OWN_TAB_KEY(platform)
  const stored = (await chrome.storage.session.get(key))[key] as number | undefined
  if (stored !== undefined) {
    const tab = await chrome.tabs.get(stored).catch(() => undefined)
    if (tab?.id !== undefined && PLATFORM_PATTERNS[platform].some((re) => re.test(tab.url ?? tab.pendingUrl ?? ''))) {
      await navigateLeavingDrafts(tab.id, url)
      return tab.id
    }
  }
  const created = await chrome.tabs.create({ url, active: false })
  if (created.id === undefined) throw new Error('failed to create tab')
  await chrome.storage.session.set({ [key]: created.id })
  await waitForTabLoad(created.id)
  return created.id
}

/**
 * Navigates our own tab even when the page asks "Leave site? Changes you made may not be saved" (an unsent X
 * draft): that native dialog blocks the tab forever and no content script can click it. Through the DevTools
 * protocol we accept it, the way a person would click "Leave".
 */
export async function navigateLeavingDrafts(tabId: number, url: string): Promise<void> {
  const target = { tabId }
  let attached = false
  const onEvent = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
    if (source.tabId === tabId && method === 'Page.javascriptDialogOpening') {
      void chrome.debugger.sendCommand(target, 'Page.handleJavaScriptDialog', { accept: true }).catch(() => undefined)
      console.warn('[zaviya] accepted a page dialog to leave an unsent draft', (params as { message?: string } | undefined)?.message)
    }
  }
  try {
    await chrome.debugger.attach(target, '1.3')
    attached = true
    chrome.debugger.onEvent.addListener(onEvent)
    await chrome.debugger.sendCommand(target, 'Page.enable')
    // A dialog that is already open (from an earlier job) is answered first
    await chrome.debugger.sendCommand(target, 'Page.handleJavaScriptDialog', { accept: true }).catch(() => undefined)
    await chrome.debugger.sendCommand(target, 'Page.navigate', { url })
  } catch {
    // Debugger unavailable (DevTools open on the tab): plain navigation, still better than nothing
    await chrome.tabs.update(tabId, { url })
  } finally {
    await waitForTabLoad(tabId)
    chrome.debugger.onEvent.removeListener(onEvent)
    if (attached) await chrome.debugger.detach(target).catch(() => undefined)
  }
}

/** The tab a stuck job ran in: our own tab for the platform if it is still there, else any tab of that platform. */
export async function findHealTab(platform: PlatformKey): Promise<number | undefined> {
  const key = OWN_TAB_KEY(platform)
  const stored = (await chrome.storage.session.get(key))[key] as number | undefined
  if (stored !== undefined) {
    const tab = await chrome.tabs.get(stored).catch(() => undefined)
    if (tab?.id !== undefined) return tab.id
  }
  return (await findTabForPlatform(platform))?.id
}
