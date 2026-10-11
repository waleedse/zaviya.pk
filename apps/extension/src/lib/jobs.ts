import type { BridgeJob, GeminiImageResult } from '@zaviya/shared'
import type { GeminiSelectors, GeneratedImage } from './gemini-dom'
import { getSettings } from './storage'
import { ensureTab, findTabForPlatform, sendToTab, withTimeout } from './tabs'

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
  const tab = await findTabForPlatform('x')
  const tabId = tab?.id ?? (await ensureTab('https://x.com/home', 'x'))
  const settings = await getSettings()
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

async function runGeminiImage(job: Extract<BridgeJob, { type: 'gemini.image' }>): Promise<GeminiImageResult> {
  const settings = await getSettings()
  // A fresh chat per image keeps earlier images out of the "new image" detection.
  // Pick the right Google account when several are signed in: a number is the /u/N/ slot, an email goes in authuser.
  const account = job.payload.account?.trim()
  const url = !account
    ? 'https://gemini.google.com/app'
    : /^\d+$/.test(account)
      ? `https://gemini.google.com/u/${account}/app`
      : `https://gemini.google.com/app?authuser=${encodeURIComponent(account)}`
  const tabId = await ensureTab(url, 'gemini')
  await sleep(3_000)
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
