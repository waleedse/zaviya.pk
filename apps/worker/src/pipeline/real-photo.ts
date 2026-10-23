import { logger } from '../logger.js'

/**
 * A real photo of the person, place or thing the story is about, for social cards only (articles keep their own hero).
 * Source: lead images of Wikipedia articles that are hosted on Wikimedia Commons (free licences), so no outlet's photos.
 * Only entities named in the headline are tried, so a card never shows an unrelated face.
 */
export interface RealPhoto {
  dataUrl: string
  credit: string
}

const API = 'https://en.wikipedia.org/w/api.php'
const MIN_WIDTH = 900
const UA = { 'user-agent': 'ZaviyaBot/1.0 (https://zaviya.pk; ops@zaviya.pk)' }

const GENERIC_FIRST = new Set(['state', 'prime', 'supreme', 'federal', 'national', 'pakistan', 'islamabad', 'punjab', 'sindh', 'chief', 'finance', 'foreign', 'central', 'general', 'united', 'world', 'north', 'south', 'east', 'west', 'high', 'court'])

/** Does the headline name this entity? The full tag, or for a person-style tag ("Shehbaz Sharif") its given name as a word ("PM Shehbaz ..."). */
export function namedIn(title: string, tag: string): boolean {
  const t = title.toLowerCase()
  const full = tag.trim().toLowerCase()
  if (full.length >= 3 && t.includes(full)) return true
  const words = full.split(/\s+/)
  const first = words[0] ?? ''
  if (words.length < 2 || words.length > 3 || first.length < 5 || GENERIC_FIRST.has(first)) return false
  return new RegExp(`(^|[^a-z])${first.replace(/[^a-z]/g, '')}([^a-z]|$)`).test(t)
}

/** Tags the headline names, longest (most specific) first. */
export function subjectsFor(title: string, tags: string[], max = 3): string[] {
  return tags
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && namedIn(title, x))
    .sort((a, b) => b.length - a.length)
    .slice(0, max)
}

interface WikiPage {
  title?: string
  index?: number
  original?: { source: string; width: number; height: number }
  imageinfo?: { url: string; thumburl?: string; width: number; height: number }[]
}

/** Files that are not photos of the subject */
const NOT_A_PHOTO = / vs\.? | v | and | with | meets |logo|flag|map|seal|chart|diagram|emblem|icon|signature|poster|stamp/i

const FREE_FILE = /\/wikipedia\/commons\/[^?]+\.(jpe?g|png)(\?|$)/i

async function query(fetchFn: typeof fetch, params: string): Promise<WikiPage[]> {
  const res = await fetchFn(`${API}?action=query&format=json&${params}`, { headers: UA, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return []
  const json = (await res.json()) as { query?: { pages?: Record<string, WikiPage> } }
  return Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 9) - (b.index ?? 9))
}

/** A name worth searching files for: a person, place or body, not a bare acronym that matches anything. */
function isSpecific(subject: string): boolean {
  return subject.trim().includes(' ') || subject.length >= 6
}

/** The article's lead image if it is a big free Commons file; else the biggest Commons file named after the subject. */
async function imageUrlFor(subject: string, fetchFn: typeof fetch): Promise<{ url: string; label: string } | null> {
  const q = encodeURIComponent(subject)
  const s = subject.toLowerCase()
  const lead = (await query(fetchFn, `generator=search&gsrlimit=3&gsrsearch=${q}&prop=pageimages&piprop=original&redirects=1`)).find(
    (p) => p.title?.toLowerCase() === s && p.original && p.original.width >= MIN_WIDTH && FREE_FILE.test(p.original.source),
  )
  if (lead?.original) return { url: lead.original.source, label: lead.title ?? subject }
  const files = (await query(fetchFn, `generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${q}&prop=imageinfo&iiprop=url|size&iiurlwidth=1600`))
    .map((p) => ({ title: p.title ?? '', info: p.imageinfo?.[0] }))
    .filter((f) => f.info && f.title.toLowerCase().includes(s) && /\.jpe?g$/i.test(f.title) && !NOT_A_PHOTO.test(f.title) && f.info.width >= MIN_WIDTH && f.info.width >= f.info.height * 0.7 && FREE_FILE.test(f.info.url) && isSpecific(subject))
    .sort((a, b) => b.info!.width - a.info!.width)
  return files[0] ? { url: files[0].info!.thumburl ?? files[0].info!.url, label: files[0].title } : null
}

export async function findRealPhoto(title: string, tags: string[], fetchFn: typeof fetch = fetch): Promise<RealPhoto | null> {
  for (const subject of subjectsFor(title, tags)) {
    try {
      const hit = await imageUrlFor(subject, fetchFn)
      if (!hit) continue
      const img = await fetchFn(hit.url, { headers: UA, signal: AbortSignal.timeout(20_000) })
      const type = img.headers.get('content-type') ?? ''
      if (!img.ok || !/^image\/(jpeg|png)/.test(type)) continue
      const buf = Buffer.from(await img.arrayBuffer())
      if (buf.length > 12_000_000) continue
      logger.info({ subject, page: hit.label }, 'real photo found for social card')
      return { dataUrl: `data:${type.split(';')[0]};base64,${buf.toString('base64')}`, credit: 'Photo: Wikimedia Commons' }
    } catch (e) {
      logger.debug({ subject, err: e instanceof Error ? e.message : e }, 'real photo lookup failed')
    }
  }
  return null
}
