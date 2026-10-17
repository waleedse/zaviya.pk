/** Rule-based captions and hashtags per platform. Pure: no network, no randomness. */
import { FPS } from './constants'
import { sceneStarts } from './compose'
import { shortenHeadline } from './text'
import type { Format, StoryInput, Timeline } from './types'

export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'threads'
export const PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'youtube', 'x', 'threads']

export interface CaptionOptions {
  platform: Platform
  trends?: string[]
  /** site url without utm parameters, e.g. https://zaviya.pk */
  url: string
}

export interface Captions {
  title?: string
  text: string
  hashtags: string[]
  firstComment?: string
}

/** Instagram allows at most 5 hashtags per post (caption and comments together). YouTube ignores all above 15. */
export const HASHTAG_CAP: Record<Platform, number> = { instagram: 5, facebook: 3, tiktok: 5, youtube: 3, x: 2, threads: 1 }
export const X_LIMIT = 280
export const X_URL_WEIGHT = 23

const GENERIC = new Set(['news', 'latest', 'update', 'updates', 'today', 'breaking', 'live', 'top', 'story', 'stories'])

/** "State Bank of Pakistan" -> "StateBankOfPakistan"; ASCII only, 3-24 chars, not generic; otherwise null. */
export function toHashtag(raw: string): string | null {
  const ascii = raw.normalize('NFKD').replace(/[^\x00-\x7F]/g, '')
  const parts = ascii.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (!parts.length) return null
  const camel = parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join('')
  if (camel.length < 3 || camel.length > 24) return null
  if (/^\d+$/.test(camel) || GENERIC.has(camel.toLowerCase())) return null
  return `#${camel}`
}

const CATEGORY_TAG: Record<string, string> = {
  pakistan: '#Pakistan',
  business: '#Business',
  world: '#WorldNews',
  'tech-telecom': '#Tech',
  ai: '#ArtificialIntelligence',
  cricket: '#Cricket',
  'education-jobs': '#Jobs',
}

function coreTag(t: Timeline): string {
  if (t.topic === 'ai-tech') return '#AI'
  if (t.topic === 'money') return '#PakistanEconomy'
  return '#PakistanNews'
}

interface Item {
  n: number
  headline: string
  dek?: string
  storyId: number
  category: string
  startFrame: number
}

function items(t: Timeline): Item[] {
  const starts = sceneStarts(t.scenes, t.transitionFrames)
  const out: Item[] = []
  t.scenes.forEach((s, i) => {
    if (s.kind === 'story') out.push({ n: s.index, headline: s.headline, dek: s.dek, storyId: s.storyId, category: s.category.slug, startFrame: starts[i]! })
    if (s.kind === 'quickhits')
      for (const r of s.rows) out.push({ n: r.number, headline: r.headline, storyId: r.storyId, category: r.category.slug, startFrame: starts[i]! })
  })
  return out.sort((a, b) => a.n - b.n)
}

/** Full ordered hashtag candidates (deduped case-insensitively, brand last). */
export function buildHashtags(timeline: Timeline, stories: StoryInput[], trends: string[] = []): string[] {
  const byId = new Map(stories.map((s) => [s.id, s]))
  const list = items(timeline)
  const out: string[] = []
  const seen = new Set<string>()
  const add = (h: string | null) => {
    if (!h) return
    const k = h.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(h)
  }
  add(coreTag(timeline))

  // trending terms found in a headline or tag rank right after the core tag
  const haystack = list.flatMap((it) => [it.headline, ...(byId.get(it.storyId)?.tags ?? [])]).map((x) => x.toLowerCase())
  for (const tr of trends) {
    const q = tr.trim().toLowerCase()
    if (q && haystack.some((h) => h.includes(q))) add(toHashtag(tr))
  }

  // One tag per story, so the few slots spread across stories. Prefer the tag people would search for: one whose
  // words appear in the headline (e.g. "inflation"), then the shortest. Obscure long tags lose.
  for (const it of list) {
    const head = it.headline.toLowerCase()
    const ranked = (byId.get(it.storyId)?.tags ?? [])
      .map((tag) => ({ tag, h: toHashtag(tag) }))
      .filter((x): x is { tag: string; h: string } => !!x.h && !seen.has(x.h.toLowerCase()))
      .map((x) => ({ ...x, score: (head.includes(x.tag.toLowerCase()) ? 100 : 0) - x.h.length }))
      .sort((a, b) => b.score - a.score)
    if (ranked[0]) add(ranked[0].h)
  }
  for (const it of list) add(CATEGORY_TAG[it.category] ?? null)
  add('#Zaviya')
  return out
}

/** Takes the first `cap` hashtags, but keeps the brand tag last whenever there is room for two or more. */
export function pickHashtags(all: string[], cap: number): string[] {
  const brand = '#Zaviya'
  const rest = all.filter((h) => h !== brand)
  if (cap <= 1) return rest.slice(0, 1)
  return [...rest.slice(0, cap - 1), brand]
}

function titleCase(words: string): string {
  const small = new Set(['in', 'to', 'and', 'of', 'the'])
  return words
    .toLowerCase()
    .split(' ')
    .map((w, i) => (w === 'ai' ? 'AI' : w === '&' || (i > 0 && small.has(w)) ? w : w[0] ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function hookLine(t: Timeline): string {
  const hook = t.scenes[0]
  return hook?.kind === 'hook' ? titleCase(hook.title.join(' ')) : 'Zaviya headlines'
}

function dateIso(date: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(date))
}

export function trackedLink(base: string, platform: Platform, format: Format, date: string): string {
  const root = base.replace(/\/+$/, '')
  return `${root}/?utm_source=${platform}&utm_medium=video&utm_campaign=${format}-${dateIso(date)}`
}

function dateLine(t: Timeline): string {
  const hook = t.scenes[0]
  return hook?.kind === 'hook' ? hook.dateLine : ''
}

const clock = (frames: number) => {
  const s = Math.max(0, Math.round(frames / FPS))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** weighted length for X: every URL counts 23 characters */
export function xLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(X_URL_WEIGHT)).length
}

function numbered(list: Item[], withDek: boolean): string[] {
  return list.flatMap((it) => [`${it.n}. ${it.headline}`, ...(withDek && it.dek ? [`   ${it.dek}`] : [])])
}

export function buildCaptions(timeline: Timeline, stories: StoryInput[], opts: CaptionOptions): Captions {
  const { platform } = opts
  const all = buildHashtags(timeline, stories, opts.trends)
  const tags = pickHashtags(all, HASHTAG_CAP[platform])
  const tagLine = tags.join(' ')
  const list = items(timeline)
  const link = trackedLink(opts.url, platform, timeline.format, timeline.date)
  const N = timeline.storyCount
  const head = `${hookLine(timeline)} · ${dateLine(timeline)}`
  const COMMENT = 'Comment the number you want explained 👇'

  if (platform === 'instagram' || platform === 'facebook') {
    const footer = platform === 'instagram' ? 'Full stories: link in bio' : `Full stories: ${link}`
    const build = (withDek: boolean, count: number) =>
      [head, '', ...numbered(list.slice(0, count), withDek), '', COMMENT, footer, '', tagLine].join('\n')
    let text = build(true, list.length)
    if (text.length > 2200) text = build(false, list.length)
    for (let c = list.length - 1; text.length > 2200 && c > 0; c--) text = build(false, c)
    return {
      text,
      hashtags: tags,
      ...(platform === 'instagram' ? { firstComment: `Full stories: ${link}` } : {}),
    }
  }

  if (platform === 'tiktok') {
    const build = (count: number) => [head, '', ...numbered(list.slice(0, count), false), '', `Comment 1–${N}`, '', tagLine].join('\n')
    let c = Math.min(5, list.length)
    let text = build(c)
    while (text.length > 2200 && c > 1) text = build(--c)
    return { text, hashtags: tags }
  }

  if (platform === 'youtube') {
    const prefix = timeline.topic === 'ai-tech' ? 'AI & Tech This Week' : timeline.topic === 'money' ? 'Pakistan Money Today' : 'Pakistan News Today'
    const suffix = N > 1 ? ` & ${N - 1} more #Shorts` : ' #Shorts'
    const lead = list[0]?.headline ?? ''
    const room = 100 - `${prefix}: `.length - suffix.length
    const leadShort = lead.length <= room ? lead : shortenHeadline(lead, Math.max(20, room), true)
    const title = `${prefix}: ${leadShort}${suffix}`.slice(0, 100)
    const chapters: string[] = []
    if (timeline.format === 'roundup60') {
      chapters.push('0:00 Intro')
      for (const it of list) if (!chapters.some((c) => c.endsWith(`${it.headline}`))) chapters.push(`${clock(it.startFrame)} ${it.n}. ${it.headline}`)
    }
    const text = [head, '', ...numbered(list, false), ...(chapters.length ? ['', ...chapters] : []), '', `Full stories: ${link}`, '', tagLine].join('\n')
    return { title, text, hashtags: tags }
  }

  if (platform === 'x') {
    const build = (count: number) => [head, ...numbered(list.slice(0, count), false), link, tagLine].join('\n')
    let c = Math.min(3, list.length)
    let text = build(c)
    while (xLength(text) > X_LIMIT && c > 0) text = build(--c)
    if (xLength(text) > X_LIMIT) text = [hookLine(timeline), link, tagLine].join('\n')
    return { text, hashtags: tags }
  }

  // threads
  const build = (count: number) => [head, '', ...numbered(list.slice(0, count), false), '', `More: ${link}`, tagLine].join('\n')
  let c = Math.min(3, list.length)
  let text = build(c)
  while (text.length > 500 && c > 0) text = build(--c)
  return { text, hashtags: tags }
}

export function buildAllCaptions(timeline: Timeline, stories: StoryInput[], url: string, trends: string[] = []): Record<Platform, Captions> {
  return Object.fromEntries(PLATFORMS.map((p) => [p, buildCaptions(timeline, stories, { platform: p, url, trends })])) as Record<Platform, Captions>
}
