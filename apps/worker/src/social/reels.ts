import { readFile } from 'node:fs/promises'
import { logger } from '../logger.js'

/**
 * Instagram and Facebook Reels from a local MP4. Both use Meta's resumable upload (the bytes go straight to
 * rupload.facebook.com), so the video never needs a public URL first.
 */
const GRAPH = 'https://graph.facebook.com/v21.0'

export interface ReelResult {
  ok: boolean
  id?: string
  error?: string
}

interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number }
}

let sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** tests replace the wait between status polls */
export function setReelSleep(fn: (ms: number) => Promise<unknown>) {
  sleep = fn as typeof sleep
}

async function graph<T>(method: 'GET' | 'POST', path: string, params: Record<string, string>, token: string): Promise<T & GraphError> {
  const qs = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(`${GRAPH}/${path}${method === 'GET' ? `?${qs}` : ''}`, {
    method,
    body: method === 'POST' ? qs : undefined,
    signal: AbortSignal.timeout(60_000),
  })
  return (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as T & GraphError
}

async function upload(uri: string, file: Buffer, token: string): Promise<string | null> {
  const res = await fetch(uri, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(file.length), 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(file),
    signal: AbortSignal.timeout(300_000),
  }).catch((e: unknown) => e as Error)
  if (res instanceof Error) return `upload failed: ${res.message}`
  if (res.ok) return null
  return `upload HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`
}

const errText = (e: GraphError['error'], step: string) => `${step}: ${e?.message ?? 'unknown error'}${e?.code ? ` (code ${e.code})` : ''}`

/** How often a new container is tried, and how long each one gets to finish after the upload */
export const IG_ATTEMPTS = 6
const IG_POLLS = 18 // x 5 s = 90 s

/**
 * Instagram Reel: create a resumable container, upload, wait until processed, publish.
 *
 * Meta's upload endpoint answers 400 "ProcessingFailedError" (retriable:false) after about 33 s for videos over ~35 s although it
 * has the whole file (ZAV-180). Measured on 24 Oct with curl and the same file: about half of the containers then go to FINISHED
 * within seconds, the other half stay IN_PROGRESS for ever (a re-upload to the same container does not help; the caption makes no
 * difference). So an upload error is not final, but a container that has not finished after 90 s is abandoned and a fresh one is
 * made, up to six times. If every container ends in ERROR or never finishes, the last upload error and status text are reported.
 */
export async function postInstagramReel(
  input: { file: string; caption: string; thumbOffsetMs?: number },
  cfg: { igUserId: string; token: string },
): Promise<ReelResult> {
  const file = await readFile(input.file)
  let last = 'no attempt made'
  for (let attempt = 1; attempt <= IG_ATTEMPTS; attempt++) {
    const created = await graph<{ id?: string; uri?: string }>(
      'POST',
      `${cfg.igUserId}/media`,
      {
        media_type: 'REELS',
        upload_type: 'resumable',
        caption: input.caption,
        share_to_feed: 'true',
        ...(input.thumbOffsetMs !== undefined ? { thumb_offset: String(input.thumbOffsetMs) } : {}),
      },
      cfg.token,
    )
    if (!created.id || !created.uri) {
      last = errText(created.error, 'create container')
      // a refused request (permissions, limits) will not get better in a minute; a network blip might
      if (created.error?.code) return { ok: false, error: last }
      await sleep(15_000)
      continue
    }

    const upErr = await upload(created.uri, file, cfg.token)
    if (upErr) logger.warn({ containerId: created.id, attempt, upErr }, 'Instagram reel upload reported an error, checking the container status')

    let verdict: 'finished' | 'error' | 'waiting' = 'waiting'
    let statusText = ''
    for (let i = 0; i < IG_POLLS; i++) {
      await sleep(5_000)
      const st = await graph<{ status_code?: string; status?: string }>('GET', created.id, { fields: 'status_code,status' }, cfg.token)
      statusText = st.status ?? st.status_code ?? ''
      if (st.status_code === 'FINISHED') {
        verdict = 'finished'
        break
      }
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') {
        verdict = 'error'
        break
      }
    }
    if (verdict === 'finished') {
      const pub = await graph<{ id?: string }>('POST', `${cfg.igUserId}/media_publish`, { creation_id: created.id }, cfg.token)
      if (!pub.id) return { ok: false, error: errText(pub.error, 'publish') }
      logger.info({ id: pub.id, attempt }, 'Instagram Reel published')
      return { ok: true, id: pub.id }
    }
    last = verdict === 'error' ? `processing: ${statusText}` : 'processing: not finished after 90 s'
    if (upErr) last += ` (${upErr})`
    logger.warn({ containerId: created.id, attempt, last }, 'Instagram container did not finish: trying a new one')
  }
  return { ok: false, error: `${last} (after ${IG_ATTEMPTS} containers)`.slice(0, 600) }
}

/** Facebook Page Reel: start, upload, finish with PUBLISHED. */
export async function postFacebookReel(
  input: { file: string; description: string; title?: string },
  cfg: { pageId: string; token: string },
): Promise<ReelResult> {
  const file = await readFile(input.file)
  const start = await graph<{ video_id?: string; upload_url?: string }>('POST', `${cfg.pageId}/video_reels`, { upload_phase: 'start' }, cfg.token)
  if (!start.video_id || !start.upload_url) return { ok: false, error: errText(start.error, 'start') }

  const upErr = await upload(start.upload_url, file, cfg.token)
  if (upErr) return { ok: false, error: upErr }

  const finish = await graph<{ success?: boolean }>(
    'POST',
    `${cfg.pageId}/video_reels`,
    {
      upload_phase: 'finish',
      video_id: start.video_id,
      video_state: 'PUBLISHED',
      description: input.description,
      ...(input.title ? { title: input.title } : {}),
    },
    cfg.token,
  )
  if (!finish.success) return { ok: false, error: errText(finish.error, 'finish') }
  logger.info({ id: start.video_id }, 'Facebook Reel published')
  return { ok: true, id: start.video_id }
}
