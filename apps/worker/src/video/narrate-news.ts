/**
 * Voiced news: the daily headline video with an Urdu voice reading the Urdu headline of each story.
 * Returns null (and the silent video is made as before) when nothing can be voiced: the Mac agent is not around,
 * fewer than three stories have an Urdu headline we can read aloud, or the voice does not come back in time.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CATEGORIES } from '@zaviya/shared'
import { storyUrKey } from './explainer/script-job.js'
import { logger } from '../logger.js'
import { composeNarrated, type NarratedInput, type NarratedTimeline, type StoryInput, type Timeline } from './lib.js'
import type { MediaHub } from './media-hub.js'
import { toSpeechText } from './urdu-speech.js'

export const MIN_VOICED_STORIES = 3
/** the agent must have asked for work this recently to count as online */
export const AGENT_ONLINE_MS = 3 * 60_000
export const VOICE_WAIT_MS = 5 * 60_000

export interface NarrateArgs {
  stories: StoryInput[]
  timeline: Timeline
  imagesDir: string
  outDir: string
  edition: 'morning' | 'evening'
}
export interface NarrateResult {
  timeline: NarratedTimeline
  assetsDir: string
}
export interface NarrateDeps {
  hub: MediaHub
  redis: { get(key: string): Promise<string | null> }
  now(): number
  /** have the main worker write the Urdu headline of stories that have none (waits for them); optional */
  requestHeadlines?(stories: { id: string; title: string; dek?: string }[]): Promise<void>
}

const INTRO: Record<'morning' | 'evening', string> = { morning: 'آج صبح کی اہم خبریں۔', evening: 'آج شام کی اہم خبریں۔' }
const OUTRO = 'مکمل خبریں زاویہ ڈاٹ پی کے پر۔'

const withStop = (s: string) => (/[۔؟!]$/.test(s.trim()) ? s.trim() : `${s.trim()}۔`)

export async function narrateEdition(deps: NarrateDeps, a: NarrateArgs): Promise<NarrateResult | null> {
  const log = logger.child({ edition: a.edition })
  const seen = await deps.hub.agentSeenAt()
  if (!seen || deps.now() - seen > AGENT_ONLINE_MS) {
    log.info('voiced news skipped: the Mac agent is offline')
    return null
  }

  // stories published before Urdu headlines were saved get theirs written now (a short job in the main worker)
  if (deps.requestHeadlines) {
    const missing: { id: string; title: string; dek?: string }[] = []
    for (const s of a.stories) if (!(await deps.redis.get(storyUrKey(String(s.id))))) missing.push({ id: String(s.id), title: s.title, ...(s.dek ? { dek: s.dek } : {}) })
    if (missing.length) await deps.requestHeadlines(missing).catch((e: unknown) => log.warn({ err: String(e) }, 'could not get Urdu headlines'))
  }

  // each story's Urdu headline and what the voice will say
  const voiced: { story: StoryInput; text: string; speech: string }[] = []
  for (const story of a.stories) {
    const raw = await deps.redis.get(storyUrKey(String(story.id)))
    const headline = raw ? (JSON.parse(raw) as { headlineUr?: string }).headlineUr?.trim() : undefined
    if (!headline) continue
    const speech = toSpeechText(headline)
    if (speech.unresolved.length || !speech.text) {
      log.info({ id: story.id, unresolved: speech.unresolved }, 'headline cannot be read aloud: left out of the voiced video')
      continue
    }
    voiced.push({ story, text: withStop(headline), speech: withStop(speech.text) })
  }
  if (voiced.length < MIN_VOICED_STORIES) {
    log.info({ have: voiced.length }, 'voiced news skipped: too few Urdu headlines')
    return null
  }

  const intro = INTRO[a.edition]
  const sentences = [intro, ...voiced.map((v) => v.speech), OUTRO]
  const jobId = await deps.hub.enqueue('tts', { sentences, lengthScale: 0.9 })
  const job = await deps.hub.waitFor(jobId, VOICE_WAIT_MS, 3000)
  if (job?.status !== 'done') {
    log.warn({ status: job?.status, error: job?.error }, 'voiced news skipped: the voice did not come back')
    return null
  }
  const wav = deps.hub.readFile(job)
  const ms = (job.meta as { sentenceMs?: number[] } | undefined)?.sentenceMs
  if (!wav || !ms || ms.length !== sentences.length) {
    log.warn('voiced news skipped: the voice answer is incomplete')
    return null
  }

  const assetsDir = path.join(a.outDir, 'narrated-assets')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(path.join(assetsDir, 'voice.wav'), wav)
  const copy = (image: string) => {
    copyFileSync(path.join(a.imagesDir, image), path.join(assetsDir, image))
    return image
  }
  const lead = voiced[0]!.story
  const cat = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.ur
  const input: NarratedInput = {
    title: `Zaviya ${a.edition} headlines`,
    titleUr: intro.replace(/۔$/, ''),
    audio: 'voice.wav',
    music: a.timeline.track.file,
    theme: a.timeline.theme,
    layout: 'full',
    cta: 'مکمل خبریں زاویہ ڈاٹ پی کے پر',
    beats: [
      { image: copy(lead.image), kicker: 'زاویہ', sentences: [{ text: intro, ms: ms[0]! }] },
      ...voiced.map((v, i) => ({
        image: copy(v.story.image),
        kicker: cat(v.story.category),
        credit: 'AI image',
        sentences: [{ text: v.text, ms: ms[i + 1]! }],
      })),
    ],
  }
  // the outro line is spoken over the last story's picture
  input.beats[input.beats.length - 1]!.sentences.push({ text: withStop('مکمل خبریں زاویہ ڈاٹ پی کے پر'), ms: ms[ms.length - 1]! })
  return { timeline: composeNarrated(input), assetsDir }
}
