import { logger } from '../logger.js'

/**
 * Hero images from Cloudflare Workers AI. FLUX.2 [klein] gives realistic 16:9 photos; FLUX.1 [schnell]
 * is the fallback. When the real news photo behind the story could be described (reference.ts), that
 * scene description steers the image so it looks like the actual event without copying the photo.
 * Images are labelled AI-generated on the site.
 */
const PRIMARY = '@cf/black-forest-labs/flux-2-klein-9b'
const FALLBACK = '@cf/black-forest-labs/flux-1-schnell'

export function fluxPrompt(brief: string, scene?: string | null): string {
  return [
    brief.trim(),
    scene ? `The real scene looks like this: ${scene.trim()}` : '',
    'Photorealistic editorial news photograph, natural light, realistic setting in Pakistan where relevant, 16:9 landscape composition, documentary style.',
    'Absolutely no text or writing of any script (no Urdu, Arabic or English letters), no banners, posters, signs, screens with text, captions, logos or watermarks.',
    'No flags of any country and no portraits or framed photos on walls. No recognisable faces of real, named people: show the scene, places or objects instead; people, if any, seen from behind or at a distance.',
  ]
    .filter(Boolean)
    .join(' ')
}

interface Opts {
  accountId?: string
  token?: string
  clusterId: string
  scene?: string | null
  fetchImpl?: typeof fetch
}

async function run(model: string, prompt: string, opts: Opts & { accountId: string; token: string }): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/ai/run/${model}`
  const headers = { Authorization: `Bearer ${opts.token}` }
  let body: BodyInit
  if (model === PRIMARY) {
    // FLUX.2 takes multipart input
    const form = new FormData()
    form.append('prompt', prompt)
    form.append('width', '1280')
    form.append('height', '720')
    body = form
  } else {
    body = JSON.stringify({ prompt, steps: 8 })
    Object.assign(headers, { 'Content-Type': 'application/json' })
  }
  const res = await doFetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(120_000) })
  const json = (await res.json().catch(() => null)) as { result?: { image?: string }; errors?: unknown } | null
  const b64 = json?.result?.image
  if (!res.ok || !b64) {
    logger.warn({ clusterId: opts.clusterId, model, status: res.status, errors: json?.errors }, 'Workers AI image failed')
    return null
  }
  return b64
}

export async function generateHeroViaWorkersAI(brief: string, opts: Opts): Promise<Blob | null> {
  if (!opts.accountId || !opts.token) return null
  const creds = { ...opts, accountId: opts.accountId, token: opts.token }
  const prompt = fluxPrompt(brief, opts.scene)
  for (const model of [PRIMARY, FALLBACK]) {
    try {
      const b64 = await run(model, prompt, creds)
      if (!b64) continue
      logger.info({ clusterId: opts.clusterId, model, withScene: Boolean(opts.scene), bytes: Math.round((b64.length * 3) / 4) }, 'Workers AI image received')
      return new Blob([Buffer.from(b64, 'base64')], { type: 'image/jpeg' })
    } catch (e) {
      logger.warn({ clusterId: opts.clusterId, model, err: e instanceof Error ? e.message : e }, 'Workers AI image failed')
    }
  }
  return null
}
