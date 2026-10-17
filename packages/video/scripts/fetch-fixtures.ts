/**
 * Builds the six sample fixtures from live public data (zaviya.pk) and downloads the hero images.
 * Reads only https://zaviya.pk/api/... and its image URLs. Urdu is used only if an article really has titleUr.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickStories, pickTopic, type Candidate } from '../src/select'
import type { EditionInput, Format, RateInput, StoryInput, Topic } from '../src/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIX = path.join(ROOT, 'fixtures')
const IMG = path.join(FIX, 'images')
const PUBLIC_IMG = path.join(ROOT, 'public', 'fixtures-images')
const BASE = 'https://zaviya.pk'

interface Article {
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
type Cand = Omit<Article, 'category'> & Candidate

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return (await r.json()) as T
}

/** Latest published articles, newest first, as many pages as needed to cover about a week. */
async function fetchArticles(): Promise<Cand[]> {
  const all: Article[] = []
  for (let page = 1; page <= 6; page++) {
    const r = await getJson<{ docs: Article[]; hasNextPage: boolean }>(
      `${BASE}/api/articles?limit=100&page=${page}&depth=1&sort=-publishedAt&locale=en&where[_status][equals]=published`,
    )
    all.push(...r.docs)
    if (!r.hasNextPage) break
  }
  return all.map((a) => ({ ...a, category: a.category?.slug ?? null, hasImage: !!a.heroImage?.url }))
}

async function download(a: Cand): Promise<string> {
  const url = a.heroImage!.url!.startsWith('http') ? a.heroImage!.url! : BASE + a.heroImage!.url
  const r = await fetch(url)
  if (!r.ok) throw new Error(`image ${r.status} ${url}`)
  const ext = (path.extname(new URL(url).pathname) || '.jpg').toLowerCase()
  const name = `${a.id}${ext}`
  writeFileSync(path.join(IMG, name), Buffer.from(await r.arrayBuffer()))
  copyFileSync(path.join(IMG, name), path.join(PUBLIC_IMG, name))
  return name
}

interface DataPoint {
  series: string
  value: number
  unit: string
  source: string
  observedAt: string
}

function rates(points: DataPoint[]): RateInput[] {
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

async function main() {
  rmSync(IMG, { recursive: true, force: true })
  rmSync(PUBLIC_IMG, { recursive: true, force: true })
  mkdirSync(IMG, { recursive: true })
  mkdirSync(PUBLIC_IMG, { recursive: true })
  for (const f of readdirSync(FIX)) if (f.endsWith('.json')) rmSync(path.join(FIX, f))

  const [articles, dp] = await Promise.all([fetchArticles(), getJson<{ docs: DataPoint[] }>(`${BASE}/api/data-points?limit=200&sort=-observedAt`)])
  console.log(`articles ${articles.length}, with titleUr ${articles.filter((a) => a.titleUr).length}, data points ${dp.docs.length}`)
  const now = new Date().toISOString()
  const rateList = rates(dp.docs)

  const morning = pickStories(articles, { windowHours: 14, limit: 6, caps: { default: 2 } })
  const used = new Set(morning.map((a) => a.id))
  const eveningMany = pickStories(articles, { windowHours: 12, limit: 12, caps: { default: 4, pakistan: 5 }, exclude: used })
  const sombreSrc = pickStories(articles, { windowHours: 14, limit: 6, caps: { default: 2 }, exclude: used })
  const aiTech = pickTopic(articles, 'ai-tech', 8)
  const money = pickTopic(articles, 'money', 6)

  const images = new Map<number, string>()
  for (const a of [...morning, ...eveningMany, ...sombreSrc, ...aiTech, ...money]) if (!images.has(a.id)) images.set(a.id, await download(a))

  const toStory = (a: Cand): StoryInput => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    titleUr: a.titleUr?.trim() ? a.titleUr : null,
    dek: a.dek ?? null,
    category: a.category ?? 'pakistan',
    image: images.get(a.id)!,
    sources: (a.sources ?? []).map((s) => ({ name: s.name, tier: s.tier })),
    isBreaking: !!a.isBreaking,
    priority: a.priority ?? 'normal',
    publishedAt: a.publishedAt,
    tags: (a.tags ?? []).map((t) => t.name).filter(Boolean),
  })
  const build = (edition: 'morning' | 'evening', format: Format, list: Cand[], topic: Topic | null = null): EditionInput => ({
    edition,
    date: now,
    format,
    topic,
    stories: list.map(toStory),
    rates: rateList,
  })

  const m30 = build('morning', 'headlines30', morning)
  const breaking = structuredClone(m30)
  breaking.format = 'flash15'
  if (breaking.stories[1]) {
    breaking.stories[1].isBreaking = true
    breaking.stories[1].priority = 'breaking'
  }
  const sombre = structuredClone(build('evening', 'headlines30', sombreSrc)) as EditionInput & { stories: (StoryInput & { _test?: boolean })[] }
  if (sombre.stories[0]) {
    sombre.stories[0].title = 'Five killed as flood waters hit Swat valley villages'
    sombre.stories[0].titleUr = null
    sombre.stories[0].dek = null
    sombre.stories[0]._test = true
  }

  const fixtures: Record<string, EditionInput> = {
    'morning-30': m30,
    'evening-60': build('evening', 'roundup60', eveningMany),
    'ai-tech-60': build('evening', 'topic60', aiTech, 'ai-tech'),
    'money-45': build('morning', 'money45', money, 'money'),
    'breaking-15': breaking,
    'sombre-30': sombre,
  }
  for (const [name, data] of Object.entries(fixtures)) {
    writeFileSync(path.join(FIX, `${name}.json`), JSON.stringify(data, null, 2) + '\n')
    console.log(name, data.format, data.stories.map((s) => `${s.id}:${s.category}`).join(' '))
  }
  console.log('rates', rateList.map((r) => `${r.series}=${r.value}(prev ${r.previous})`).join(' '))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
