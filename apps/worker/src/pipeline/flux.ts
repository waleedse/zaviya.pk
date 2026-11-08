import { logger } from '../logger.js'

/**
 * Fallback hero images from Cloudflare Workers AI (FLUX.2 [klein], FLUX.1 [schnell] as backup), used only when no real
 * Wikimedia Commons photo exists (real-photo.ts). Generic illustrations only; labelled AI-generated on the site.
 */
const PRIMARY = '@cf/black-forest-labs/flux-2-klein-9b'
const FALLBACK = '@cf/black-forest-labs/flux-1-schnell'

/**
 * Last-resort hero: a generic editorial illustration of the story's theme, never a "photo" of an event.
 * The prompt forbids real people, real events (elections, disasters, wars), specific real buildings and any country
 * or culture the theme does not name (a US story once got a Pakistani school). The real scene is no longer fed in:
 * describing the actual event is what made the images read as fake news photos.
 */
export function fluxPrompt(brief: string, _scene?: string | null): string {
  return [
    `Theme: ${brief.trim()}.`,
    'A clean, modern, abstract editorial illustration for a news website, flat vector style with soft gradients and simple shapes that suggest the theme (for example coins and charts for the economy, a ballot box for a vote, a shield for security), 16:9 landscape composition, calm colour palette. It is clearly an illustration, not a photograph.',
    'Do not depict real, named or recognisable people, real events, elections, protests, disasters, accidents, wars or crimes, or any specific real building, landmark, chamber or palace. No crowds, no destroyed or damaged places, no children.',
    'Do not assume any country or culture: no national flags, symbols, architecture, clothing or landscapes of any country, and never place the scene in Pakistan unless the theme names Pakistan.',
    'Absolutely no text or writing of any script (no Urdu, Arabic or English letters), no numbers, banners, posters, signs, screens with text, captions, logos or watermarks.',
  ].join(' ')
}

interface Opts {
  accountId?: string
  token?: string
  clusterId: string
  scene?: string | null
  fetchImpl?: typeof fetch
  /** use this prompt as it is (no news-photo wrapper) and this size (default 1280x720) */
  rawPrompt?: string
  width?: number
  height?: number
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
    form.append('width', String(opts.width ?? 1280))
    form.append('height', String(opts.height ?? 720))
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
  const prompt = opts.rawPrompt ?? fluxPrompt(brief, opts.scene)
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
