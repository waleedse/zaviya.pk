/**
 * The explainer's pictures: realistic vertical photographs from Gemini (through the Chrome extension on the Mac, the same route as the
 * news hero images) with FLUX on Cloudflare Workers AI as the fallback. The video service queues the jobs in the media hub (kind "gemini");
 * the main worker owns the extension, so it claims them over HTTP and answers with the picture.
 */
import { logger } from '../../logger.js'
import type { BridgeServer } from '../../bridge/server.js'
import { generateHeroViaWorkersAI } from '../../pipeline/flux.js'
import { GEMINI_ACCOUNT_TIMEOUT_MS, generateHeroViaExtension, geminiAccounts } from '../../pipeline/media.js'

export const PORTRAIT = { width: 720, height: 1280 } as const

/** A scene written as a photograph, with the lines that keep faces, lettering and flags out. */
export function photoPrompt(brief: string): string {
  return [
    brief.trim().replace(/\.+$/, '') + '.',
    'Photorealistic vertical 9:16 photograph, natural light, realistic setting, rich detail, cinematic but believable, the subject fills the frame.',
    'Absolutely no text or writing of any script (no Urdu, Arabic or English letters), no logos, no watermarks, no captions, no screens or signs with readable words.',
    'No flags of any country. No recognisable faces of real people: show the scene, objects or places; people, if any, only from behind or at a distance.',
  ].join(' ')
}

export interface ImageDeps {
  bridge: Pick<BridgeServer, 'isOnline' | 'send'>
  geminiAccount?: string
  accountId?: string
  aiToken?: string
  fetchImpl?: typeof fetch
}

export interface MadeImage {
  blob: Blob
  source: 'gemini' | 'flux'
}

export async function makeExplainerImage(deps: ImageDeps, brief: string, id: string): Promise<MadeImage | null> {
  const prompt = photoPrompt(brief)
  // Gemini first (free, the better pictures); one try per account, then FLUX rather than hold the video up
  for (const account of geminiAccounts(deps.geminiAccount)) {
    const blob = await generateHeroViaExtension(prompt, deps.bridge, id, account, GEMINI_ACCOUNT_TIMEOUT_MS).catch(() => null)
    if (blob) return { blob, source: 'gemini' }
  }
  const flux = await generateHeroViaWorkersAI(brief, { accountId: deps.accountId, token: deps.aiToken, clusterId: id, rawPrompt: prompt, ...PORTRAIT, fetchImpl: deps.fetchImpl }).catch(() => null)
  return flux ? { blob: flux, source: 'flux' } : null
}

/** Claims "gemini" jobs from the media hub one at a time and answers each with a picture. Never throws. */
export function startExplainerImageWorker(opts: { hubUrl: string; token: string; deps: ImageDeps; fetchImpl?: typeof fetch; stop?: () => boolean }): void {
  const doFetch = opts.fetchImpl ?? fetch
  const hub = opts.hubUrl.replace(/\/+$/, '')
  const head = { Authorization: `Bearer ${opts.token}` }
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
  void (async () => {
    while (!opts.stop?.()) {
      try {
        const res = await doFetch(`${hub}/claim`, { method: 'POST', headers: { ...head, 'content-type': 'application/json' }, body: JSON.stringify({ agent: 'worker-gemini', kinds: ['gemini'], waitSec: 20 }), signal: AbortSignal.timeout(45_000) })
        if (res.status === 204) continue
        if (!res.ok) {
          await pause(30_000)
          continue
        }
        const job = (await res.json()) as { id: string; payload: { prompt: string } }
        const made = await makeExplainerImage(opts.deps, job.payload.prompt, `explainer-${job.id.slice(-8)}`)
        if (!made) {
          await doFetch(`${hub}/fail/${job.id}`, { method: 'POST', headers: { ...head, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'no picture from Gemini or FLUX' }) }).catch(() => {})
          continue
        }
        const type = made.blob.type || 'image/png'
        await doFetch(`${hub}/result/${job.id}`, {
          method: 'PUT',
          headers: { ...head, 'content-type': type, 'x-meta': JSON.stringify({ model: made.source }) },
          body: new Uint8Array(await made.blob.arrayBuffer()),
          signal: AbortSignal.timeout(120_000),
        })
        logger.info({ id: job.id, source: made.source, bytes: made.blob.size }, 'explainer picture delivered')
      } catch (e) {
        logger.debug({ err: e instanceof Error ? e.message : String(e) }, 'explainer image worker: hub not reachable')
        await pause(30_000)
      }
    }
  })()
}
