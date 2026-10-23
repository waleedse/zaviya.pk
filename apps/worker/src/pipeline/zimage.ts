import { logger } from '../logger.js'

/**
 * Z-Image Turbo (Tongyi-MAI, 6B, Apache-2.0) on fal.ai: 8 steps, about half a cent a picture, a few seconds.
 * Used when IMAGE_SOURCE=zimage and FAL_KEY is set; FLUX on Workers AI and Gemini stay as fallbacks.
 */
const ENDPOINT = 'https://fal.run/fal-ai/z-image/turbo'

interface Opts {
  key?: string
  clusterId: string
  width?: number
  height?: number
  fetchImpl?: typeof fetch
}

export async function generateViaZImage(prompt: string, opts: Opts): Promise<Blob | null> {
  if (!opts.key) return null
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Key ${opts.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        image_size: { width: opts.width ?? 1280, height: opts.height ?? 720 },
        num_inference_steps: 8,
        num_images: 1,
        output_format: 'jpeg',
        enable_safety_checker: true,
      }),
      signal: AbortSignal.timeout(90_000),
    })
    const json = (await res.json().catch(() => null)) as { images?: { url?: string }[]; detail?: unknown } | null
    const url = json?.images?.[0]?.url
    if (!res.ok || !url) {
      logger.warn({ clusterId: opts.clusterId, status: res.status, detail: json?.detail }, 'Z-Image Turbo failed')
      return null
    }
    const img = await doFetch(url, { signal: AbortSignal.timeout(60_000) })
    const type = img.headers.get('content-type') ?? 'image/jpeg'
    if (!img.ok || !/^image\//.test(type)) return null
    const blob = new Blob([await img.arrayBuffer()], { type: type.split(';')[0] })
    logger.info({ clusterId: opts.clusterId, bytes: blob.size }, 'Z-Image Turbo image received')
    return blob
  } catch (e) {
    logger.warn({ clusterId: opts.clusterId, err: e instanceof Error ? e.message : e }, 'Z-Image Turbo failed')
    return null
  }
}
