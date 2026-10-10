import type { PlatformKey } from './storage'

const PLATFORM_PATTERNS: Record<PlatformKey, RegExp[]> = {
  x: [/^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i],
  instagram: [/^https?:\/\/(www\.)?instagram\.com\//i],
  facebook: [/^https?:\/\/(www\.)?facebook\.com\//i, /^https?:\/\/(www\.)?web\.facebook\.com\//i],
}

export async function scanOpenPlatforms(): Promise<Record<PlatformKey, boolean>> {
  const tabs = await chrome.tabs.query({})
  const out: Record<PlatformKey, boolean> = { x: false, instagram: false, facebook: false }
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
  const existing = await findTabForPlatform(platform)
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { url, active: false })
    await waitForTabLoad(existing.id)
    return existing.id
  }
  const created = await chrome.tabs.create({ url, active: false })
  if (created.id === undefined) throw new Error('failed to create tab')
  await waitForTabLoad(created.id)
  return created.id
}

function waitForTabLoad(tabId: number, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error('tab load timeout'))
    }, timeoutMs)

    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(onUpdated)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

export async function sendToTab<T>(tabId: number, message: unknown): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>
}
