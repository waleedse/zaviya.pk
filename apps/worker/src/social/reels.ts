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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
  })
  if (res.ok) return null
  return `upload HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`
}

const errText = (e: GraphError['error'], step: string) => `${step}: ${e?.message ?? 'unknown error'}${e?.code ? ` (code ${e.code})` : ''}`

/** Instagram Reel: create a resumable container, upload, wait until processed, publish. */
export async function postInstagramReel(
  input: { file: string; caption: string; thumbOffsetMs?: number },
  cfg: { igUserId: string; token: string },
): Promise<ReelResult> {
  const file = await readFile(input.file)
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
  if (!created.id || !created.uri) return { ok: false, error: errText(created.error, 'create container') }

  const upErr = await upload(created.uri, file, cfg.token)
  if (upErr) return { ok: false, error: upErr }

  // Processing usually takes 10-60 s; give it up to 5 minutes
  for (let i = 0; i < 60; i++) {
    await sleep(5_000)
    const st = await graph<{ status_code?: string; status?: string }>('GET', created.id, { fields: 'status_code,status' }, cfg.token)
    if (st.status_code === 'FINISHED') break
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') return { ok: false, error: `processing: ${st.status ?? st.status_code}` }
    if (i === 59) return { ok: false, error: 'processing: timed out after 5 min' }
  }

  const pub = await graph<{ id?: string }>('POST', `${cfg.igUserId}/media_publish`, { creation_id: created.id }, cfg.token)
  if (!pub.id) return { ok: false, error: errText(pub.error, 'publish') }
  logger.info({ id: pub.id }, 'Instagram Reel published')
  return { ok: true, id: pub.id }
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
