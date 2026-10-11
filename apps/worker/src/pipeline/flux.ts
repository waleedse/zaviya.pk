import { logger } from '../logger.js'

/**
 * Fallback hero images from Cloudflare Workers AI (FLUX.1 schnell, free daily allowance).
 * Used when the Chrome extension is offline or Gemini has failed three times, so a story is never
 * held back for an image. Images are labelled AI-generated on the site like Gemini's.
 */
const MODEL = '@cf/black-forest-labs/flux-1-schnell'

export function fluxPrompt(brief: string): string {
  return [
    brief.trim(),
    'Photorealistic editorial news photograph, natural light, realistic setting in Pakistan where relevant, 16:9 landscape composition.',
    'No text, letters, captions, logos or watermarks. No recognisable faces of real, named people: show the scene, places or objects instead.',
  ].join(' ')
}

export async function generateHeroViaWorkersAI(
  brief: string,
  opts: { accountId?: string; token?: string; clusterId: string; fetchImpl?: typeof fetch },
): Promise<Blob | null> {
  if (!opts.accountId || !opts.token) return null
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(`https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fluxPrompt(brief), steps: 8 }),
      signal: AbortSignal.timeout(90_000),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; result?: { image?: string }; errors?: unknown } | null
    const b64 = json?.result?.image
    if (!res.ok || !b64) {
      logger.warn({ clusterId: opts.clusterId, status: res.status, errors: json?.errors }, 'Workers AI image failed')
      return null
    }
    logger.info({ clusterId: opts.clusterId, bytes: Math.round((b64.length * 3) / 4) }, 'Workers AI (FLUX) image received')
    return new Blob([Buffer.from(b64, 'base64')], { type: 'image/jpeg' })
  } catch (e) {
    logger.warn({ clusterId: opts.clusterId, err: e instanceof Error ? e.message : e }, 'Workers AI image failed')
    return null
  }
}
