import type { BridgeJob } from '@zaviya/shared'
import { getSettings } from './storage'
import { ensureTab, findTabForPlatform, sendToTab } from './tabs'

function unwrapTabResponse<T>(res: T): T {
  if (res && typeof res === 'object' && 'error' in res && typeof (res as { error: string }).error === 'string') {
    throw new Error((res as { error: string }).error)
  }
  return res
}

export async function runBridgeJob(job: BridgeJob): Promise<unknown> {
  switch (job.type) {
    case 'x.readList':
      return runXReadList(job)
    case 'x.post':
      return runXPost(job)
    case 'instagram.post':
      return runInstagramPost(job)
    case 'gemini.image':
      // TODO: open gemini.google.com and capture image via DOM — not implemented.
      throw new Error('gemini.image_not_implemented')
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

async function runXPost(job: Extract<BridgeJob, { type: 'x.post' }>): Promise<unknown> {
  const tab = await findTabForPlatform('x')
  const tabId =
    tab?.id ?? (await ensureTab('https://x.com/home', 'x'))
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
