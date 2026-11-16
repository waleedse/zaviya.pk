import { logger } from '../logger.js'

/**
 * Hero images from Z-Image Turbo (Tongyi-MAI, Apache-2.0, Q8 GGUF) in ComfyUI on our own M3 Mac (Waleed, 16 Nov:
 * "M3 par image model chala gya, generate from there until Gemini gets unblocked"). Free: no API, no per-image cost.
 * The M3 keeps an SSH reverse tunnel to the server; the worker reaches it at COMFY_URL. Unreachable or slow -> null,
 * and the next source (Gemini, then FLUX) takes over.
 */

export const DEFAULT_ZIMAGE_UNET = 'z_image_turbo-Q8_0.gguf'

export function zImageWorkflow(prompt: string, width: number, height: number, seed: number, prefix: string, unet = DEFAULT_ZIMAGE_UNET) {
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: unet } },
    '2': { class_type: 'CLIPLoaderGGUF', inputs: { clip_name: 'Qwen3-4B-Instruct-2507-Q8_0.gguf', type: 'lumina2' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '4': { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3.0 } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '6': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    '7': { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    '8': {
      class_type: 'KSampler',
      inputs: { model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0], seed, steps: 8, cfg: 1.0, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1.0 },
    },
    '9': { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    '10': { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: prefix } },
  }
}

interface Opts {
  url?: string
  clusterId: string
  width?: number
  height?: number
  fetchImpl?: typeof fetch
  /** whole job, queue wait included (the first picture after a restart loads the model: ~100 s) */
  timeoutMs?: number
  pollMs?: number
}

interface HistoryEntry {
  status?: { completed?: boolean; status_str?: string }
  outputs?: Record<string, { images?: { filename: string; subfolder?: string; type?: string }[] }>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The Z-Image file actually installed on the M3. Its name changes when the model is swapped (16 Nov:
 * z_image_turbo-Q8_0.gguf -> z_image_turbo-Q8_0-comfy.gguf broke every picture), so ask ComfyUI instead of guessing.
 */
export async function findZImageUnet(base: string, doFetch: typeof fetch): Promise<string> {
  try {
    const info = (await (await doFetch(`${base}/object_info/UnetLoaderGGUF`, { signal: AbortSignal.timeout(15_000) })).json()) as {
      UnetLoaderGGUF?: { input?: { required?: { unet_name?: [string[]] } } }
    }
    const names = info.UnetLoaderGGUF?.input?.required?.unet_name?.[0] ?? []
    return names.find((n) => /z[_-]?image/i.test(n)) ?? DEFAULT_ZIMAGE_UNET
  } catch {
    return DEFAULT_ZIMAGE_UNET
  }
}

export async function generateViaComfy(prompt: string, opts: Opts): Promise<Blob | null> {
  if (!opts.url) return null
  const base = opts.url.replace(/\/+$/, '')
  const doFetch = opts.fetchImpl ?? fetch
  const deadline = Date.now() + (opts.timeoutMs ?? 300_000)
  try {
    const unet = await findZImageUnet(base, doFetch)
    const wf = zImageWorkflow(prompt, opts.width ?? 1280, opts.height ?? 720, Math.floor(Math.random() * 1_000_000), `zaviya_${opts.clusterId}`, unet)
    const res = await doFetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: wf }),
      signal: AbortSignal.timeout(15_000),
    })
    const queued = (await res.json().catch(() => null)) as { prompt_id?: string; error?: unknown } | null
    const id = queued?.prompt_id
    if (!res.ok || !id) {
      logger.warn({ clusterId: opts.clusterId, status: res.status, error: queued?.error }, 'M3 Z-Image: not queued')
      return null
    }
    while (Date.now() < deadline) {
      await sleep(opts.pollMs ?? 3000)
      const h = (await (await doFetch(`${base}/history/${id}`, { signal: AbortSignal.timeout(15_000) })).json().catch(() => ({}))) as Record<string, HistoryEntry>
      const entry = h[id]
      if (!entry) continue
      if (entry.status?.status_str === 'error') {
        logger.warn({ clusterId: opts.clusterId }, 'M3 Z-Image: generation error')
        return null
      }
      if (!entry.status?.completed) continue
      const img = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? [])[0]
      if (!img) return null
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })
      const file = await doFetch(`${base}/view?${q}`, { signal: AbortSignal.timeout(60_000) })
      const type = file.headers.get('content-type') ?? 'image/png'
      if (!file.ok || !/^image\//.test(type)) return null
      const blob = new Blob([await file.arrayBuffer()], { type: type.split(';')[0] })
      logger.info({ clusterId: opts.clusterId, bytes: blob.size }, 'M3 Z-Image image received')
      return blob
    }
    logger.warn({ clusterId: opts.clusterId }, 'M3 Z-Image: timed out')
    return null
  } catch (e) {
    logger.warn({ clusterId: opts.clusterId, err: e instanceof Error ? e.message : e }, 'M3 Z-Image: unreachable')
    return null
  }
}
