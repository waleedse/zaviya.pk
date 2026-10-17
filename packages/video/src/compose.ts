import { CATEGORIES } from '@zaviya/shared'
import tracksJson from '../public/audio/tracks.json'
import { FPS, HANDLES, SITE, TRANSITION_FRAMES } from './constants'
import { formatDates, shortDate } from './hijri'
import { creditLine, findFigure, findHighlight, isSombre, shortenDek, shortenHeadline, wordCount } from './text'
import type {
  Edition,
  EditionInput,
  Format,
  Mode,
  QuickHitsScene,
  RateInput,
  Scene,
  StoryInput,
  StoryScene,
  ThemeName,
  Timeline,
  Topic,
  TrackInfo,
} from './types'

export class NotEnoughStories extends Error {
  constructor(
    public readonly have: number,
    public readonly need = 3,
  ) {
    super(`Need at least ${need} stories, got ${have}`)
    this.name = 'NotEnoughStories'
  }
}

export interface FormatConfig {
  totalFrames: number
  minStories: number
  maxStories: number
  /** minimum frames per full story scene */
  minStoryFrames: number
  /** stories beyond this many become quick hits (roundup only) */
  fullMax: number
  dekAlways: boolean
  numbers: 'none' | 'first' | 'after4' | 'before-last'
  quickHits: boolean
  hookFrames: number
  outroFrames: number
  numbersFrames: number
}

export const FORMATS: Record<Format, FormatConfig> = {
  flash15: { totalFrames: 450, minStories: 1, maxStories: 1, minStoryFrames: 90, fullMax: 1, dekAlways: true, numbers: 'none', quickHits: false, hookFrames: 45, outroFrames: 75, numbersFrames: 0 },
  headlines30: { totalFrames: 900, minStories: 3, maxStories: 6, minStoryFrames: 105, fullMax: 6, dekAlways: false, numbers: 'before-last', quickHits: false, hookFrames: 45, outroFrames: 105, numbersFrames: 105 },
  roundup60: { totalFrames: 1800, minStories: 6, maxStories: 12, minStoryFrames: 90, fullMax: 8, dekAlways: false, numbers: 'after4', quickHits: true, hookFrames: 45, outroFrames: 105, numbersFrames: 105 },
  topic60: { totalFrames: 1800, minStories: 5, maxStories: 8, minStoryFrames: 165, fullMax: 8, dekAlways: true, numbers: 'none', quickHits: false, hookFrames: 45, outroFrames: 105, numbersFrames: 0 },
  money45: { totalFrames: 1350, minStories: 3, maxStories: 6, minStoryFrames: 90, fullMax: 6, dekAlways: false, numbers: 'first', quickHits: false, hookFrames: 45, outroFrames: 105, numbersFrames: 135 },
}

const RATE_MAX_AGE_MS = 36 * 3600 * 1000
const QUICK_HIT_ROWS = 4

export const DEFAULT_TRACKS = tracksJson as TrackInfo[]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function dayOfYear(iso: string): number {
  // calendar day in Pakistan time
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000)
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000)
}

export function pickMode(stories: StoryInput[]): Mode {
  if (stories.some((s) => s.isBreaking || s.priority === 'breaking')) return 'breaking'
  if (stories[0] && isSombre(stories[0].title)) return 'sombre'
  return 'normal'
}

export function pickTheme(mode: Mode, edition: Edition, topic: Topic | null = null): ThemeName {
  if (mode === 'breaking') return 'breaking'
  if (mode === 'sombre') return 'sombre'
  if (topic === 'ai-tech') return 'tech'
  if (topic === 'money') return 'money'
  return edition === 'morning' ? 'sunrise' : 'night'
}

export function pickTrack(
  mode: Mode,
  edition: Edition,
  date: string,
  tracks: TrackInfo[],
  trackId?: string,
  topic: Topic | null = null,
): TrackInfo {
  if (trackId) {
    const t = tracks.find((x) => x.id === trackId)
    if (t) return t
  }
  const mood =
    mode === 'sombre' ? 'calm' : mode === 'breaking' ? 'night' : topic === 'ai-tech' ? 'night' : topic === 'money' ? 'bright' : edition === 'morning' ? 'bright' : 'night'
  const pool = tracks.filter((t) => t.mood === mood)
  const list = pool.length ? pool : tracks
  if (!list.length) throw new Error('No audio tracks available')
  return list[dayOfYear(date) % list.length]!
}

const fmt = (n: number, dp: number) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

function delta(r: RateInput): 'up' | 'down' | 'flat' {
  if (r.previous == null || !r.previous) return 'flat'
  const ch = (r.value - r.previous) / r.previous
  if (Math.abs(ch) < 0.0005) return 'flat'
  return ch > 0 ? 'up' : 'down'
}

export function rateTiles(rates: RateInput[], now: string) {
  const t = new Date(now).getTime()
  const fresh = (r: RateInput) => {
    const age = t - new Date(r.observedAt).getTime()
    return Number.isFinite(age) && age <= RATE_MAX_AGE_MS && r.value > 0
  }
  const by = (s: RateInput['series']) => rates.find((r) => r.series === s && fresh(r))
  const tiles: { label: string; value: string; delta: 'up' | 'down' | 'flat'; source: string }[] = []
  const usd = by('usd_interbank')
  if (usd) tiles.push({ label: 'USD/PKR', value: fmt(usd.value, 2), delta: delta(usd), source: usd.source })
  const gold = by('gold_24k_tola')
  if (gold) tiles.push({ label: 'GOLD 24K /TOLA', value: `Rs ${fmt(gold.value, 0)}`, delta: delta(gold), source: gold.source })
  const petrol = by('petrol_super')
  if (petrol) tiles.push({ label: 'PETROL /LITRE', value: `Rs ${fmt(petrol.value, 2)}`, delta: delta(petrol), source: petrol.source })
  return tiles
}

function catOf(slug: string) {
  const cat = CATEGORIES.find((c) => c.slug === slug)
  return { slug, label: cat?.en ?? slug, color: cat?.color ?? '#555555' }
}

function storyScene(s: StoryInput, index: number, total: number, dekAlways: boolean): StoryScene {
  const category = catOf(s.category)
  const headline = shortenHeadline(s.title, 70)
  const figure = findFigure(headline, category.label)
  const highlight = findHighlight(headline, figure)
  const ur = s.titleUr?.trim()
  const dek = s.dek?.trim()
  return {
    kind: 'story',
    storyId: s.id,
    index,
    total,
    headline,
    ...(ur ? { headlineUr: shortenHeadline(ur, 90) } : {}),
    ...(dek && shortenDek(dek, 140) ? { dek: shortenDek(dek, 140)! } : {}),
    ...(dekAlways ? { dekAlways: true } : {}),
    ...(highlight ? { highlight } : {}),
    ...(figure ? { figure } : {}),
    category,
    image: s.image,
    credit: creditLine(s.sources),
    durationInFrames: 0,
  }
}

function hookTitle(format: Format, mode: Mode, edition: Edition, topic: Topic | null, n: number, leadCategory: string): [string, string] {
  if (format === 'flash15') return ['BREAKING', leadCategory.toUpperCase()]
  if (topic === 'ai-tech') return ['AI & TECH', 'THIS WEEK']
  if (topic === 'money') return ['MONEY', 'IN 45 SECONDS']
  if (mode === 'breaking') return ['BREAKING', `AND ${n - 1} MORE`]
  if (edition === 'morning') return [`${n} STORIES`, 'TO KNOW TODAY']
  return ['TODAY IN', format === 'roundup60' ? '60 SECONDS' : '30 SECONDS']
}

function coverPrefix(format: Format, edition: Edition, topic: Topic | null): string {
  if (format === 'flash15') return 'BREAKING'
  if (topic === 'ai-tech') return 'AI & TECH'
  if (topic === 'money') return 'MONEY'
  return edition === 'evening' ? 'TONIGHT' : 'TODAY'
}

/** Frame at which each scene starts (transitions overlap). */
export function sceneStarts(scenes: { durationInFrames: number }[], transitionFrames = TRANSITION_FRAMES): number[] {
  const out: number[] = []
  let t = 0
  for (const s of scenes) {
    out.push(t)
    t += s.durationInFrames - transitionFrames
  }
  return out
}

export function compose(input: EditionInput, formatArg?: Format, tracks: TrackInfo[] = DEFAULT_TRACKS): Timeline {
  const format: Format = formatArg ?? input.format ?? 'headlines30'
  const cfg = FORMATS[format]
  const topic = input.topic ?? null
  const tf = TRANSITION_FRAMES

  // breaking story leads, the rest keep their (ranked) order
  let pool = input.stories
  const bi = pool.findIndex((s) => s.isBreaking || s.priority === 'breaking')
  if (bi > 0) pool = [pool[bi]!, ...pool.slice(0, bi), ...pool.slice(bi + 1)]
  const ranked = pool.slice(0, cfg.maxStories)
  if (ranked.length < cfg.minStories) throw new NotEnoughStories(ranked.length, cfg.minStories)

  const mode = pickMode(ranked)
  const theme = pickTheme(mode, input.edition, topic)
  const track = pickTrack(mode, input.edition, input.date, tracks, input.trackId, topic)
  const beat = Math.round((FPS * 60) / track.bpm)
  const snap = (f: number) => Math.max(beat, Math.round(f / beat) * beat)

  const tiles = rateTiles(input.rates, input.date)
  const hasNumbers = cfg.numbers !== 'none' && tiles.length >= 2

  const fixedBase = snap(cfg.hookFrames) + snap(cfg.outroFrames) + (hasNumbers ? snap(cfg.numbersFrames) : 0)

  // Cut the lowest-ranked stories until every full story gets at least its minimum time.
  let count = ranked.length
  let full = 0
  let qhRows = 0
  let qhFrames = 0
  let pot = 0
  let target = 0
  for (; count >= cfg.minStories; count--) {
    full = cfg.quickHits ? Math.min(count, cfg.fullMax) : count
    qhRows = cfg.quickHits && count > cfg.fullMax ? Math.min(QUICK_HIT_ROWS, count - cfg.fullMax) : 0
    qhFrames = qhRows ? snap(60 + qhRows * 40) : 0
    const scenesN = 2 + full + (hasNumbers ? 1 : 0) + (qhRows ? 1 : 0)
    target = cfg.totalFrames + tf * (scenesN - 1)
    pot = target - fixedBase - qhFrames
    if (pot / full >= cfg.minStoryFrames) break
  }
  if (count < cfg.minStories) {
    count = cfg.minStories
    full = cfg.quickHits ? Math.min(count, cfg.fullMax) : count
    qhRows = cfg.quickHits && count > cfg.fullMax ? Math.min(QUICK_HIT_ROWS, count - cfg.fullMax) : 0
    qhFrames = qhRows ? snap(60 + qhRows * 40) : 0
    const scenesN = 2 + full + (hasNumbers ? 1 : 0) + (qhRows ? 1 : 0)
    target = cfg.totalFrames + tf * (scenesN - 1)
    pot = target - fixedBase - qhFrames
  }
  const stories = ranked.slice(0, count)
  const total = stories.length

  const storyScenes = stories.slice(0, full).map((s, i) => storyScene(s, i + 1, total, cfg.dekAlways))

  // Durations: by headline length (equal in explainer formats), on beats, remainder spread by beat then to the lead.
  const weights = storyScenes.map((sc, i) => {
    const sec = cfg.dekAlways ? 6 : clamp(wordCount(sc.headline) / 3 + 1, 3.5, 5.0)
    return sec + (i === 0 ? beat / FPS : 0)
  })
  const wsum = weights.reduce((a, b) => a + b, 0)
  const durs = weights.map((w) => snap((pot * w) / wsum))
  let rem = pot - durs.reduce((a, b) => a + b, 0)
  let k = 0
  while (Math.abs(rem) >= beat && k < 1000) {
    const i = k % durs.length
    const step = rem > 0 ? beat : -beat
    if (rem > 0 || durs[i]! + step >= cfg.minStoryFrames) {
      durs[i]! += step
      rem -= step
    }
    k++
  }
  durs[0]! += rem
  storyScenes.forEach((sc, i) => (sc.durationInFrames = durs[i]!))

  const hook: Scene = {
    kind: 'hook',
    durationInFrames: snap(cfg.hookFrames),
    title: hookTitle(format, mode, input.edition, topic, total, storyScenes[0]!.category.label),
    dateLine: formatDates(input.date),
    image: storyScenes[0]!.image,
  }
  const numbersScene: Scene | null = hasNumbers ? { kind: 'numbers', durationInFrames: snap(cfg.numbersFrames), tiles } : null
  let quick: QuickHitsScene | null = null
  if (qhRows) {
    quick = {
      kind: 'quickhits',
      durationInFrames: qhFrames,
      rows: stories.slice(full, full + qhRows).map((s, i) => ({
        storyId: s.id,
        number: full + i + 1,
        headline: shortenHeadline(s.title, 60),
        category: catOf(s.category),
        image: s.image,
      })),
    }
  }

  const scenes: Scene[] = [hook]
  if (numbersScene && cfg.numbers === 'first') scenes.push(numbersScene)
  storyScenes.forEach((sc, i) => {
    if (numbersScene && cfg.numbers === 'before-last' && i === storyScenes.length - 1) scenes.push(numbersScene)
    if (numbersScene && cfg.numbers === 'after4' && storyScenes.length <= 4 && i === storyScenes.length - 1) scenes.push(numbersScene)
    scenes.push(sc)
    if (numbersScene && cfg.numbers === 'after4' && storyScenes.length > 4 && i === 3) scenes.push(numbersScene)
  })
  if (quick) scenes.push(quick)
  scenes.push({
    kind: 'outro',
    durationInFrames: snap(cfg.outroFrames),
    cta: format === 'flash15' ? 'Follow for live updates' : `Which story matters most? Comment 1–${total}`,
    count: format === 'flash15' ? 0 : total,
    handles: HANDLES,
    site: SITE,
  })

  const totalFrames = scenes.reduce((a, s) => a + s.durationInFrames, 0) - tf * (scenes.length - 1)
  if (totalFrames !== cfg.totalFrames) throw new Error(`compose: ${format} totals ${totalFrames}, expected ${cfg.totalFrames}`)
  return {
    edition: input.edition,
    format,
    topic,
    date: input.date,
    storyCount: total,
    mode,
    theme,
    track: { file: track.file, bpm: track.bpm, firstBeatMs: track.firstBeatMs },
    transitionFrames: tf,
    scenes,
    totalFrames,
    coverLine: `${coverPrefix(format, input.edition, topic)} · ${shortDate(input.date)}`,
  }
}
