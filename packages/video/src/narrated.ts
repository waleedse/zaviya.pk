/**
 * Narrated videos (explainers and voiced news): beats of picture + spoken Urdu, timed from the audio itself.
 * Pure and deterministic. The voice file is one WAV with every sentence in order; `ms` per sentence comes from the voice
 * service (it includes the short silence after the sentence), so captions and pictures can never drift from the voice.
 */
import { FPS } from './constants'
import type { ThemeName } from './types'

export const NARRATED_LEAD_IN_FRAMES = 12
export const NARRATED_END_FRAMES = 66
export const NARRATED_MAX_SECONDS = 90
/** the silence the voice adds after each sentence; captions end before it */
export const SENTENCE_GAP_MS = 280

export interface NarratedSentence {
  /** the Urdu shown as caption (may keep digits and brand names; the voice read a spelled-out version) */
  text: string
  ms: number
}

export interface NarratedBeatInput {
  /** file name under public/narrated/ (copied in before a render) or an absolute URL */
  image: string
  /** small credit on the picture: "AI illustration" or "Photo: Wikimedia Commons" */
  credit?: string
  /** small Urdu heading above the caption */
  kicker?: string
  sentences: NarratedSentence[]
}

export interface NarratedInput {
  title: string
  titleUr: string
  beats: NarratedBeatInput[]
  /** file name under public/narrated/ */
  audio: string
  /** background music under audio/ (served by staticFile), kept very low under the voice */
  music?: string
  theme?: ThemeName
  /** the line on the end card */
  cta: string
  site?: string
}

export interface CaptionChunk {
  text: string
  from: number
  to: number
}

export interface NarratedBeat {
  image: string
  credit?: string
  kicker?: string
  from: number
  durationInFrames: number
  /** 0..3: how the picture drifts, so neighbours do not move the same way */
  drift: number
  chunks: CaptionChunk[]
}

export interface NarratedTimeline {
  kind: 'narrated'
  title: string
  titleUr: string
  theme: ThemeName
  beats: NarratedBeat[]
  audio: string
  music?: string
  cta: string
  site: string
  endFrom: number
  totalFrames: number
  /** shown on the cover still */
  coverLine: string
}

const frames = (ms: number) => Math.round((ms / 1000) * FPS)

/** Up to `maxWords` words per caption chunk, timed by character count across [from, to). */
export function captionChunks(text: string, from: number, to: number, maxWords = 3): CaptionChunk[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const groups: string[][] = []
  for (let i = 0; i < words.length; i += maxWords) groups.push(words.slice(i, i + maxWords))
  // do not leave a lonely last word
  if (groups.length > 1 && groups[groups.length - 1]!.length === 1) groups[groups.length - 2]!.push(...groups.pop()!)
  const weights = groups.map((g) => g.join(' ').length + 2)
  const total = weights.reduce((a, b) => a + b, 0)
  let cursor = from
  return groups.map((g, i) => {
    const span = ((to - from) * weights[i]!) / total
    const chunk = { text: g.join(' '), from: Math.round(cursor), to: Math.round(cursor + span) }
    cursor += span
    return chunk
  })
}

export function composeNarrated(input: NarratedInput): NarratedTimeline {
  if (!input.beats.length) throw new Error('a narrated video needs at least one beat')
  let t = NARRATED_LEAD_IN_FRAMES
  const beats: NarratedBeat[] = input.beats.map((b, i) => {
    const from = t
    const chunks: CaptionChunk[] = []
    for (const s of b.sentences) {
      const start = t
      t += frames(s.ms)
      chunks.push(...captionChunks(s.text, start, Math.max(start + 6, t - frames(SENTENCE_GAP_MS))))
    }
    return { image: b.image, credit: b.credit, kicker: b.kicker, from, durationInFrames: t - from, drift: i % 4, chunks }
  })
  const endFrom = t
  const totalFrames = endFrom + NARRATED_END_FRAMES
  if (totalFrames / FPS > NARRATED_MAX_SECONDS) throw new Error(`narrated video is ${Math.round(totalFrames / FPS)} s: shorten the script`)
  return {
    kind: 'narrated',
    title: input.title,
    titleUr: input.titleUr,
    theme: input.theme ?? 'tech',
    beats,
    audio: input.audio,
    music: input.music,
    cta: input.cta,
    site: input.site ?? 'zaviya.pk',
    endFrom,
    totalFrames,
    coverLine: input.titleUr,
  }
}
