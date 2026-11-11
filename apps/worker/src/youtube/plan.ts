/**
 * What goes to YouTube and how it is worded. Pure functions (tested) plus one reader that turns an edition folder
 * (video.mp4 with captions.json or script.json next to it) into a queue item, for the live flow and the backfill alike.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { isHardBlocked, isSensitive } from '../video/explainer/ideas.js'

/** A Short is vertical and at most 3 minutes; anything longer goes up as a normal video */
export const SHORT_MAX_SEC = 180

export type YtKind = 'explainer' | 'digest'

export interface YtItem {
  /** sha1 of the edition key: the same video is never queued or uploaded twice, live or backfilled */
  id: string
  /** the edition or round folder name, e.g. 2026-11-12-evening-headlines30 */
  key: string
  kind: YtKind
  /** 0 = made just now, 1 = backfilled explainer, 2 = backfilled digest: lower goes first */
  tier: 0 | 1 | 2
  /** absolute path of the MP4 inside the video service (the media hub serves it to the extension through a short-lived token) */
  file: string
  title: string
  description: string
  short: boolean
  durationSec: number | null
  /** the article the post row hangs on; empty = the newest article */
  articleId?: string
  /** made from AI pictures: Studio's "altered or synthetic content" question is answered Yes */
  syntheticMedia: boolean
  /** when the video was made (file time): backfill goes oldest first inside a tier */
  madeAt: number
  /** file size in bytes: the extension checks its download against it */
  sizeBytes?: number
  attempts: number
}

export const itemId = (key: string): string => createHash('sha1').update(`youtube:${key}`).digest('hex').slice(0, 20)

/** Queue order: made-just-now first, then explainers, then digests; oldest first inside a tier */
export const orderScore = (item: Pick<YtItem, 'tier' | 'madeAt'>): number => item.tier * 1e14 + item.madeAt

// ---- content guard ---------------------------------------------------------------------------------------------------------

const RELIGION =
  /\b(islam\w*|muslims?|qur'?an\w*|hadith|sunnah|namaz|salah|prayers?|mosque\w*|masjid|church\w*|temples?|hindu\w*|christian\w*|sikh\w*|jewish|jews|religio\w*|eid|ramazan|ramadan|muharram|ashura|hajj|umrah|fatwa|imam|maulana|mufti|ulema|madrasa\w*|zakat)\b/i

const VIOLENCE = /\b(blasts?|bombs?|bombing\w*|explosions?|shoot\w*|gunmen|gunfire|violen\w*|stabb\w*|clash(?:es)?|killings?|assault\w*|torture\w*|hostages?)\b/i

/**
 * Nothing political, army, religion or violence goes to YouTube. This reuses the explainer pipeline's hard block (blasphemy,
 * sectarian, minors, party and army names) and its sensitive list (violence, courts, elections, ministers, war), and adds religion.
 * It is deliberately strict: a skipped video costs nothing, a wrong one costs the channel.
 */
export function blockedReason(text: string): string | null {
  if (isHardBlocked(text)) return 'hard block (blasphemy, sectarian, minors, party or army)'
  if (isSensitive(text)) return 'sensitive (violence, courts, politics, war)'
  if (VIOLENCE.test(text)) return 'violence'
  if (RELIGION.test(text)) return 'religion'
  return null
}

/** A price, rate or market figure in an old video would mislead: it has changed since */
const PERISHABLE = /\b(rates?|prices?|petrol|diesel|gold|silver|dollar|usd|rupee|psx|kse|stock|exchange|sensex|inflation|cpi)\b/i
export const STALE_AFTER_MS = 3 * 86_400_000

export function outdatedReason(text: string, madeAt: number, now: number): string | null {
  return PERISHABLE.test(text) && now - madeAt > STALE_AFTER_MS ? 'a price or rate that has changed since' : null
}

// ---- wording ----------------------------------------------------------------------------------------------------------------

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Title: the headline in the words people search, at most 100 characters, " #Shorts" only on a Short */
export function ytTitle(base: string, short: boolean): string {
  const tag = short ? ' #Shorts' : ''
  const stripped = clean(base.replace(/#shorts/gi, ''))
  const room = 100 - tag.length
  const cut = stripped.length <= room ? stripped : `${stripped.slice(0, room - 1).replace(/\s+\S*$/, '')}…`
  return `${cut}${tag}`
}

/** Description: a few lines, the story link, hashtags (and #Shorts on a Short) */
export function ytDescription(lines: string[], link: string, hashtags: string[], short: boolean): string {
  const tags = [...new Set([...hashtags.map((t) => `#${t.replace(/^#/, '')}`), ...(short ? ['#Shorts'] : [])])].slice(0, 6)
  return [...lines.map(clean).filter(Boolean).slice(0, 3), '', `Read more on Zaviya: ${link}`, '', tags.join(' ')].join('\n').slice(0, 4900)
}

// ---- reading an edition folder ---------------------------------------------------------------------------------------------

interface Probe {
  /** duration in seconds, or null when it cannot be told */
  (file: string, dir: string): Promise<number | null>
}

export interface ItemOptions {
  siteUrl: string
  probe: Probe
  tier: 0 | 1 | 2
  /** the story the explainer is about, when the round knew it */
  articleId?: string
}

const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

interface ExplainerFile {
  idea?: { title?: string; angle?: string; articleId?: number; sources?: string[] }
  script?: { title?: string; titleUr?: string; caption?: string; hashtags?: string[]; beats?: { kicker?: string; text?: string }[] }
}
interface DigestCaptions {
  youtube?: { title?: string; text?: string; hashtags?: string[] }
}
interface TimelineFile {
  totalFrames?: number
  scenes?: { kind?: string; storyId?: number }[]
}

/** Why an edition folder was left out (or the item to queue) */
export type ItemResult = { item: YtItem } | { skip: string }

export async function itemFromDir(dir: string, opts: ItemOptions, now = Date.now()): Promise<ItemResult> {
  const key = path.basename(dir)
  const file = path.join(dir, 'video.mp4')
  if (!existsSync(file)) return { skip: 'no video.mp4 in the folder' }
  const madeAt = statSync(file).mtimeMs
  const explainer = readJson<ExplainerFile>(path.join(dir, 'script.json'))
  const captions = readJson<DigestCaptions>(path.join(dir, 'captions.json'))
  const timeline = readJson<TimelineFile>(path.join(dir, 'timeline.json'))

  let kind: YtKind
  let baseTitle: string
  let lines: string[]
  let hashtags: string[]
  let link = opts.siteUrl
  let guardText: string
  let articleId = opts.articleId
  let ready: { title: string; description: string } | null = null

  const duration = await opts.probe(file, dir)
  const short = duration === null ? true : duration <= SHORT_MAX_SEC

  if (explainer?.script?.title) {
    kind = 'explainer'
    const s = explainer.script
    baseTitle = s.title!
    lines = [s.caption ?? '']
    hashtags = ['Explainer', ...(s.hashtags ?? []).slice(0, 2), 'Zaviya']
    link = explainer.idea?.sources?.find((u) => u.startsWith(opts.siteUrl)) ?? opts.siteUrl
    articleId ??= explainer.idea?.articleId !== undefined ? String(explainer.idea.articleId) : undefined
    guardText = [baseTitle, s.titleUr, s.caption, explainer.idea?.title, explainer.idea?.angle, ...(s.beats ?? []).flatMap((b) => [b.kicker, b.text])].filter(Boolean).join(' ')
  } else if (captions?.youtube?.title) {
    kind = 'digest'
    const y = captions.youtube
    baseTitle = y.title!
    hashtags = y.hashtags ?? []
    // the digest caption already is a description: headlines, the link and the tags (trending ones included)
    const text = (y.text ?? '').trim()
    lines = []
    ready = { title: ytTitle(baseTitle, short), description: short ? text : text.replace(/\s*#Shorts\b/gi, '') }
    link = /https?:\/\/\S*zaviya\.pk\S*/i.exec(text)?.[0] ?? opts.siteUrl
    const lead = timeline?.scenes?.find((sc) => sc.kind === 'story')
    articleId ??= lead?.storyId !== undefined ? String(lead.storyId) : undefined
    guardText = `${baseTitle} ${text}`
  } else {
    return { skip: 'no captions.json or script.json (nothing says what the video is about)' }
  }

  const blocked = blockedReason(guardText)
  if (blocked) return { skip: blocked }
  const stale = outdatedReason(guardText, madeAt, now)
  if (stale && opts.tier !== 0) return { skip: stale }

  const built = ready ?? { title: ytTitle(baseTitle, short), description: ytDescription(lines, link, hashtags, short) }
  const item: YtItem = {
    id: itemId(key),
    key,
    kind,
    tier: opts.tier === 0 ? 0 : kind === 'explainer' ? 1 : 2,
    file,
    title: built.title,
    description: built.description.slice(0, 4900),
    short,
    durationSec: duration,
    articleId,
    syntheticMedia: kind === 'explainer',
    madeAt,
    sizeBytes: statSync(file).size,
    attempts: 0,
  }
  return { item }
}

/** Duration from the timeline's frame count (30 fps in the video package), the cheapest honest source */
export const probeFromTimeline =
  (fps: number): Probe =>
  async (_file, dir) => {
    const t = readJson<TimelineFile>(path.join(dir, 'timeline.json'))
    return t?.totalFrames ? t.totalFrames / fps : null
  }
