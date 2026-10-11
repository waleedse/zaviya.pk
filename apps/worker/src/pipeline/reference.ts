import { logger } from '../logger.js'
import { ZAVIYA_USER_AGENT } from '../ingest/extract.js'

/**
 * Reference scene for hero images: the real news photo behind a story (og:image of a source article),
 * described in words by Gemini. FLUX then paints an original, realistic image of that kind of scene.
 * The photo itself is never stored or published, and the description leaves out names, faces and text.
 */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export function extractOgImage(html: string, pageUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) {
      try {
        return new URL(m[1].replace(/&amp;/g, '&'), pageUrl).toString()
      } catch {
        /* bad URL */
      }
    }
  }
  return null
}

async function fetchReferenceImage(pageUrl: string, fetchImpl: typeof fetch): Promise<{ data: Buffer; mime: string } | null> {
  const page = await fetchImpl(pageUrl, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
  if (!page.ok) return null
  const imageUrl = extractOgImage((await page.text()).slice(0, 300_000), page.url || pageUrl)
  if (!imageUrl) return null
  const img = await fetchImpl(imageUrl, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, signal: AbortSignal.timeout(10_000) })
  const mime = img.headers.get('content-type')?.split(';')[0] ?? ''
  if (!img.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) return null
  const data = Buffer.from(await img.arrayBuffer())
  // Skip logos and placeholder thumbnails
  if (data.length < 15_000 || data.length > MAX_IMAGE_BYTES) return null
  return { data, mime }
}

export const DESCRIBE_PROMPT = [
  'This is a photo from a news report. Describe the scene so a photographer could take a similar but original photo:',
  'the setting and type of place, likely city or region if obvious, time of day, weather and light, the main objects,',
  'what the people are doing in general terms, and the mood. 2-3 sentences.',
  'Do not name anyone, do not describe faces, and do not mention any text, logos, watermarks or channel branding.',
].join(' ')

async function describeWithGemini(img: { data: Buffer; mime: string }, apiKey: string, fetchImpl: typeof fetch): Promise<string | null> {
  const res = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: img.mime, data: img.data.toString('base64') } }, { text: DESCRIBE_PROMPT }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (!res.ok) return null
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(' ').trim()
  return text ? text.slice(0, 700) : null
}

/** Describe the real photo behind the story, trying up to three source articles. Null when none works. */
export async function describeReferenceScene(
  sourceUrls: string[],
  opts: { geminiApiKey?: string; clusterId: string; fetchImpl?: typeof fetch },
): Promise<string | null> {
  if (!opts.geminiApiKey) return null
  const doFetch = opts.fetchImpl ?? fetch
  // Google News links are redirects that need JavaScript; outlet URLs work best.
  const candidates = sourceUrls.filter((u) => !/news\.google\.com/.test(u)).slice(0, 3)
  for (const url of candidates) {
    try {
      const img = await fetchReferenceImage(url, doFetch)
      if (!img) continue
      const scene = await describeWithGemini(img, opts.geminiApiKey, doFetch)
      if (scene) {
        logger.info({ clusterId: opts.clusterId, from: new URL(url).hostname }, 'reference scene described')
        return scene
      }
    } catch (e) {
      logger.debug({ clusterId: opts.clusterId, url, err: e instanceof Error ? e.message : e }, 'reference image skipped')
    }
  }
  return null
}
