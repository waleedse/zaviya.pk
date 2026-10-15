import type { BridgeJob, GeminiImageResult } from '@zaviya/shared'
import type { GeminiSelectors, GeneratedImage } from './gemini-dom'
import { getSettings } from './storage'
import { ensureGeminiWindowTab, ensureTab, findTabForPlatform, sendToTab, showBriefly, withTimeout } from './tabs'

function unwrapTabResponse<T>(res: T): T {
  if (res && typeof res === 'object' && 'error' in res && typeof (res as { error: string }).error === 'string') {
    throw new Error((res as { error: string }).error)
  }
  return res
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** One Gemini generation at a time: parallel prompts in one account look like abuse and confuse the DOM wait. */
let geminiChain: Promise<unknown> = Promise.resolve()

export async function runBridgeJob(job: BridgeJob): Promise<unknown> {
  switch (job.type) {
    case 'x.readList':
      return runXReadList(job)
    case 'x.post':
      return runXPost(job)
    case 'x.search':
      return runXSearch(job)
    case 'x.trending':
      return runXTrending()
    case 'instagram.post':
      return runInstagramPost(job)
    case 'instagram.readProfile':
      return runInstagramReadProfile(job)
    case 'page.read':
      return readPage(job.payload.url)
    case 'gemini.image': {
      // Hard ceiling per image so one stuck run can never block every later job.
      const run = geminiChain.then(() => withTimeout(runGeminiImage(job), 300_000, 'gemini_job_timeout'))
      geminiChain = run.catch(() => undefined)
      return run
    }
    default:
      throw new Error('unknown_job')
  }
}

/**
 * Reader tab: one background tab reused for every page read. Pages open with Waleed's own browser,
 * so outlets that block the server (Dawn, ARY, jobs sites) and Google News redirects work.
 */
let readerTabId: number | undefined

async function readerTab(url: string): Promise<number> {
  if (readerTabId !== undefined) {
    try {
      await chrome.tabs.update(readerTabId, { url })
      return readerTabId
    } catch {
      readerTabId = undefined
    }
  }
  const tab = await chrome.tabs.create({ url, active: false })
  if (tab.id === undefined) throw new Error('reader_tab_failed')
  readerTabId = tab.id
  return tab.id
}

async function readPage(url: string): Promise<unknown> {
  const tabId = await readerTab(url)
  // Wait for the load and for any redirect away from news.google.com (it redirects with JavaScript)
  for (let i = 0; i < 40; i++) {
    await sleep(750)
    const tab = await chrome.tabs.get(tabId)
    if (tab.status === 'complete' && tab.url && !/^https:\/\/news\.google\.com\//.test(tab.url)) break
  }
  await sleep(1_500)
  const [res] = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta = (sel: string) => document.querySelector<HTMLMetaElement>(sel)?.content ?? null
        const root = document.querySelector('article') ?? document.querySelector('main') ?? document.body
        const seen = new Set<string>()
        const paras: string[] = []
        root.querySelectorAll('p, h2, li').forEach((el) => {
          const t = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() ?? ''
          if (t.length < 50 || seen.has(t)) return
          if (el.closest('nav, header, footer, aside, form, [class*="comment"], [class*="related"], [class*="share"]')) return
          seen.add(t)
          paras.push(t)
        })
        return {
          url: location.href,
          title: meta('meta[property="og:title"]') ?? document.title,
          text: paras.join('\n\n').slice(0, 20_000),
          image: meta('meta[property="og:image"]'),
          publishedAt: meta('meta[property="article:published_time"]'),
        }
      },
    }),
    30_000,
    'page_read_timeout',
  )
  if (!res?.result) throw new Error('page_read_empty')
  return res.result
}

async function runXReadList(job: Extract<BridgeJob, { type: 'x.readList' }>): Promise<unknown> {
  const tabId = await ensureTab(job.payload.listUrl, 'x')
  const settings = await getSettings()
  return unwrapTabResponse(
    await sendToTab<{ posts: unknown[] }>(tabId, {
      kind: 'zaviya',
      action: 'x.readList',
      listUrl: job.payload.listUrl,
      sinceId: job.payload.sinceId,
      delayMinMs: settings.actionDelayMinMs,
      delayMaxMs: settings.actionDelayMaxMs,
    }),
  )
}

async function runXSearch(job: Extract<BridgeJob, { type: 'x.search' }>): Promise<unknown> {
  const url = `https://x.com/search?q=${encodeURIComponent(job.payload.query)}&src=typed_query&f=live`
  const tabId = await ensureTab(url, 'x')
  return unwrapTabResponse(await sendToTab(tabId, { kind: 'zaviya', action: 'x.scrape', limit: job.payload.limit }))
}

async function runXTrending(): Promise<unknown> {
  const tabId = await ensureTab('https://x.com/explore/tabs/trending', 'x')
  return unwrapTabResponse(await sendToTab(tabId, { kind: 'zaviya', action: 'x.trends' }))
}

async function runXPost(job: Extract<BridgeJob, { type: 'x.post' }>): Promise<unknown> {
  // Always start from the home timeline, and bring the tab forward while posting: X does not
  // reliably mount its composer in a background tab or on a page without the Post button.
  const [previous] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const tabId = await ensureTab('https://x.com/home', 'x')
  await chrome.tabs.update(tabId, { active: true })
  const settings = await getSettings()
  try {
    return unwrapTabResponse(
      await sendToTab<{ externalId?: string }>(tabId, {
        kind: 'zaviya',
        action: 'x.post',
        text: job.payload.text,
        mediaUrls: job.payload.mediaUrls,
        delayMinMs: settings.actionDelayMinMs,
        delayMaxMs: settings.actionDelayMaxMs,
      }),
    )
  } finally {
    if (previous?.id !== undefined && previous.id !== tabId) await chrome.tabs.update(previous.id, { active: true }).catch(() => undefined)
  }
}

async function runInstagramPost(job: Extract<BridgeJob, { type: 'instagram.post' }>): Promise<unknown> {
  const tabId = await ensureTab('https://www.instagram.com/', 'instagram')
  const settings = await getSettings()
  return unwrapTabResponse(
    await sendToTab<{ externalId?: string }>(tabId, {
      kind: 'zaviya',
      action: 'instagram.post',
      caption: job.payload.caption,
      mediaUrls: job.payload.mediaUrls,
      delayMinMs: settings.actionDelayMinMs,
      delayMaxMs: settings.actionDelayMaxMs,
    }),
  )
}

async function runInstagramReadProfile(job: Extract<BridgeJob, { type: 'instagram.readProfile' }>): Promise<unknown> {
  const username = job.payload.username.replace(/^@/, '')
  const tabId = await ensureTab(`https://www.instagram.com/${encodeURIComponent(username)}/`, 'instagram')
  return unwrapTabResponse(
    await sendToTab(tabId, { kind: 'zaviya', action: 'instagram.readProfile', username, limit: job.payload.limit }),
  )
}

function parseSelectorOverrides(json: string): Partial<GeminiSelectors> | undefined {
  if (!json.trim()) return undefined
  try {
    return JSON.parse(json) as Partial<GeminiSelectors>
  } catch {
    return undefined
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Seconds without keyboard or mouse before Waleed counts as away from the laptop */
const AWAY_AFTER_S = 120

async function runGeminiImage(job: Extract<BridgeJob, { type: 'gemini.image' }>): Promise<GeminiImageResult> {
  // Gemini needs its window in front for a moment. While Waleed is working (or the screen is locked,
  // where the window cannot show) answer at once, so the server uses FLUX instead of waiting.
  const state = await chrome.idle.queryState(AWAY_AFTER_S)
  if (state !== 'idle') throw new Error(`gemini_user_${state}`)
  const settings = await getSettings()
  // A fresh chat per image keeps earlier images out of the "new image" detection.
  // Pick the right Google account when several are signed in: a number is the /u/N/ slot, an email goes in authuser.
  const account = job.payload.account?.trim()
  const url = !account
    ? 'https://gemini.google.com/app'
    : /^\d+$/.test(account)
      ? `https://gemini.google.com/u/${account}/app`
      : `https://gemini.google.com/app?authuser=${encodeURIComponent(account)}`
  const { tabId, windowId } = await ensureGeminiWindowTab(url)
  await sleep(3_000)
  // Forward just long enough to type and send; generation then runs in the background
  await showBriefly(windowId, 12_000)
  const prompt = `Generate an image: ${job.payload.prompt}`
  const generated = unwrapTabResponse(
    await sendToTab<GeneratedImage & { error?: string }>(tabId, {
      kind: 'zaviya',
      action: 'gemini.generateImage',
      prompt,
      selectors: parseSelectorOverrides(settings.geminiSelectorsJson),
      timeoutMs: 180_000,
    }),
  )

  if (generated.dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(generated.dataUrl)
    if (!m) throw new Error('gemini_bad_data_url')
    return { base64: m[2]!, mimeType: m[1]!, width: generated.width, height: generated.height }
  }
  if (!generated.url) throw new Error('gemini_no_image')
  // Cross-origin image (googleusercontent): the service worker can read it thanks to host permissions.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  const res = await fetch(generated.url, { credentials: 'include', signal: ctrl.signal }).finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error(`gemini_image_fetch_${res.status}`)
  const blob = await res.blob()
  return { base64: await blobToBase64(blob), mimeType: blob.type || 'image/png', width: generated.width, height: generated.height }
}
