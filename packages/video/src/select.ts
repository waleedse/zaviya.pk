/** Pure story selection helpers (used by scripts/fetch-fixtures.ts). */
import type { Edition, EditionInput, Format, RateInput, StoryInput, Topic } from './types'

export interface Candidate {
  id: number
  title: string
  category: string | null
  priority?: string
  publishedAt: string
  hasImage: boolean
}

const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )

/** Naive same-story test: 50% or more of the shorter title's words are shared. */
export function sameStory(a: string, b: string): boolean {
  const A = words(a)
  const B = words(b)
  if (!A.size || !B.size) return false
  let n = 0
  for (const w of A) if (B.has(w)) n++
  return n / Math.min(A.size, B.size) >= 0.5
}

const rank = (c: Candidate) => (c.priority === 'breaking' ? 2 : c.priority === 'high' ? 1 : 0)

export interface PickOptions {
  windowHours: number
  limit: number
  /** only these categories */
  categories?: string[]
  /** max stories per category; `caps.default` applies to the rest */
  caps?: Record<string, number>
  /** skip these ids first, then top up with them if there are not enough */
  exclude?: Set<number>
}

/** Rank by priority then newest, require a photo, dedupe same stories, cap per category. */
export function pickStories<T extends Candidate>(all: T[], o: PickOptions): T[] {
  if (!all.length) return []
  const newest = Math.max(...all.map((a) => +new Date(a.publishedAt)))
  const pool = all
    .filter(
      (a) =>
        a.hasImage &&
        newest - +new Date(a.publishedAt) <= o.windowHours * 3600_000 &&
        (!o.categories || (a.category !== null && o.categories.includes(a.category))),
    )
    .sort((a, b) => rank(b) - rank(a) || +new Date(b.publishedAt) - +new Date(a.publishedAt))
  const out: T[] = []
  const run = (skip: (a: T) => boolean) => {
    for (const a of pool) {
      if (out.length >= o.limit) break
      if (out.includes(a) || skip(a)) continue
      const cat = a.category ?? 'x'
      const cap = o.caps?.[cat] ?? o.caps?.default ?? o.limit
      if (out.filter((x) => (x.category ?? 'x') === cat).length >= cap) continue
      if (out.some((x) => sameStory(x.title, a.title))) continue
      out.push(a)
    }
  }
  run((a) => !!o.exclude?.has(a.id))
  if (out.length < o.limit && o.exclude) run(() => false)
  return out
}

export const TOPIC_CATEGORIES: Record<Topic, string[]> = {
  'ai-tech': ['ai', 'tech-telecom'],
  money: ['business'],
}

/** Topic edition: ai-tech uses a 96 h window (extended to 168 h with fewer than 5 stories), money the last 12 h. */
export function pickTopic<T extends Candidate>(all: T[], topic: Topic, limit = 8): T[] {
  const categories = TOPIC_CATEGORIES[topic]
  if (topic === 'money') return pickStories(all, { windowHours: 12, limit: Math.min(limit, 6), categories, caps: { default: 6 } })
  const first = pickStories(all, { windowHours: 96, limit, categories, caps: { default: 5 } })
  if (first.length >= 5) return first
  return pickStories(all, { windowHours: 168, limit, categories, caps: { default: 5 } })
}

// ---- live data -> EditionInput -------------------------------------------------------------

/** The fields of the public `/api/articles?depth=1` docs that the video needs. */
export interface ApiArticle {
  id: number
  title: string
  titleUr?: string | null
  dek?: string | null
  slug: string
  category: { slug: string } | null
  tags?: { name: string }[] | null
  heroImage?: { url?: string } | null
  sources?: { name: string; tier: number }[]
  isBreaking?: boolean
  priority?: 'normal' | 'high' | 'breaking'
  publishedAt: string
}

export interface ApiDataPoint {
  series: string
  value: number
  unit: string
  source: string
  observedAt: string
}

export type SelectedArticle = Omit<ApiArticle, 'category'> & Candidate

export function toCandidate(a: ApiArticle): SelectedArticle {
  return { ...a, category: a.category?.slug ?? null, hasImage: !!a.heroImage?.url }
}

/** Latest value per series plus the previous distinct value (for the up/down arrow). */
export function ratesFromDataPoints(points: ApiDataPoint[]): RateInput[] {
  const out: RateInput[] = []
  for (const series of ['usd_interbank', 'gold_24k_tola', 'petrol_super'] as const) {
    const rows = points.filter((p) => p.series === series).sort((a, b) => +new Date(b.observedAt) - +new Date(a.observedAt))
    const latest = rows[0]
    if (!latest) continue
    const prev = rows.find((r) => r.value !== latest.value)
    out.push({ series, value: latest.value, previous: prev?.value ?? null, unit: latest.unit, source: latest.source, observedAt: latest.observedAt })
  }
  return out
}

export interface SelectOptions {
  articles: ApiArticle[]
  rates: ApiDataPoint[]
  format: Format
  edition: Edition
  topic?: Topic | null
  /** edition time (ISO) */
  date: string
  /** story ids already used by an earlier edition: skipped first, used only to top up */
  exclude?: Set<number>
  /** breaking flash: use exactly this article (if it is in `articles`) */
  onlyId?: number
  /** resolves a story's hero image to the `image` field (a local file name once downloaded) */
  imageFor?: (a: ApiArticle) => string
}

/** Format-specific selection from live data. `stories[].image` is the hero URL unless `imageFor` says otherwise. */
export function selectEdition(o: SelectOptions): { input: EditionInput; picked: SelectedArticle[] } {
  const all = o.articles.map(toCandidate)
  let picked: SelectedArticle[]
  switch (o.format) {
    case 'flash15':
      picked = o.onlyId !== undefined
        ? pickStories(all.filter((a) => a.id === o.onlyId), { windowHours: 6, limit: 1 })
        : pickStories(all, { windowHours: 6, limit: 1, exclude: o.exclude })
      break
    case 'roundup60':
      picked = pickStories(all, { windowHours: 12, limit: 12, caps: { default: 4, pakistan: 5 }, exclude: o.exclude })
      break
    case 'topic60':
      picked = pickTopic(all, o.topic ?? 'ai-tech', 8)
      break
    case 'money45':
      picked = pickTopic(all, 'money', 6)
      break
    default:
      picked = pickStories(all, { windowHours: 14, limit: 6, caps: { default: 2 }, exclude: o.exclude })
  }
  const stories: StoryInput[] = picked.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    titleUr: a.titleUr?.trim() ? a.titleUr : null,
    dek: a.dek ?? null,
    category: a.category ?? 'pakistan',
    image: o.imageFor ? o.imageFor(a as unknown as ApiArticle) : (a.heroImage?.url ?? ''),
    sources: (a.sources ?? []).map((s) => ({ name: s.name, tier: s.tier })),
    isBreaking: !!a.isBreaking,
    priority: a.priority ?? 'normal',
    publishedAt: a.publishedAt,
    tags: (a.tags ?? []).map((t) => t.name).filter(Boolean),
  }))
  return {
    picked,
    input: {
      edition: o.edition,
      date: o.date,
      format: o.format,
      topic: o.format === 'money45' ? 'money' : o.format === 'topic60' ? (o.topic ?? 'ai-tech') : (o.topic ?? null),
      stories,
      rates: ratesFromDataPoints(o.rates),
    },
  }
}
