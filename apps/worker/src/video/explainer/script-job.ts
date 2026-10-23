/** The main worker's side of an explainer: write the script and leave it in Redis for the video service. */
import { z } from 'zod'
import { extractJson, zodToJsonSchema, type LLMRouter } from '@zaviya/llm'
import { numbersNotInArticle } from '../../social/guards.js'
import { toLatinDigits, toSpeechText } from '../urdu-speech.js'
import type { Idea } from './ideas.js'
import { writeExplainerScript, type ScriptResult } from './script.js'

/** Redis key of a story's Urdu headline (also written by the publish step, read by the voiced news video) */
export const storyUrKey = (articleId: string) => `story:ur:${articleId}`

export const EXPLAINER_QUEUE = 'explainer'
export const scriptKey = (ideaId: string) => `explainer:script:${ideaId}`

export type StoredScript = ({ status: 'done' } & ScriptResult) | { status: 'failed'; error: string }

interface KV {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>
}

export async function processExplainerScript(data: { idea: Idea }, deps: { router: LLMRouter; redis: KV }): Promise<StoredScript> {
  let out: StoredScript
  try {
    out = { status: 'done', ...(await writeExplainerScript({ router: deps.router }, data.idea)) }
  } catch (e) {
    out = { status: 'failed', error: e instanceof Error ? e.message : String(e) }
  }
  // a finished script is kept for three days (a retry reuses it); a failure only for six hours
  await deps.redis.set(scriptKey(data.idea.id), JSON.stringify(out), 'EX', out.status === 'done' ? 3 * 86400 : 6 * 3600)
  return out
}

/** The video service's side: reuse a finished script, otherwise ask the main worker and wait for it. */
export async function requestScript(
  deps: { redis: KV; queue: { add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown> }; sleep(ms: number): Promise<void>; now(): number },
  idea: Idea,
  waitMs: number,
): Promise<ScriptResult | null> {
  const read = async (): Promise<StoredScript | null> => {
    const raw = await deps.redis.get(scriptKey(idea.id))
    return raw ? (JSON.parse(raw) as StoredScript) : null
  }
  const first = await read()
  if (first?.status === 'done') return first
  if (first?.status !== 'failed') await deps.queue.add('script', { idea }, { jobId: `script-${idea.id}-${Math.floor(deps.now() / 3_600_000)}`, attempts: 1, removeOnComplete: true, removeOnFail: true })
  else await deps.queue.add('script', { idea }, { jobId: `script-${idea.id}-${deps.now()}`, attempts: 1, removeOnComplete: true, removeOnFail: true })
  const until = deps.now() + waitMs
  while (deps.now() < until) {
    await deps.sleep(5000)
    const got = await read()
    if (got?.status === 'done') return got
    // a failure written after we asked (not the stale one we saw at the start) ends the wait
    if (got?.status === 'failed' && JSON.stringify(got) !== JSON.stringify(first)) return null
  }
  return null
}


// ---- Urdu headlines on demand (voiced news) ---------------------------------------------------

const HeadlinesSchema = z.object({ items: z.array(z.object({ id: z.string(), headlineUr: z.string().min(6).max(140) })) })

const HEADLINE_SYSTEM = `You write short Urdu headlines that a presenter reads aloud in a news video. For each English headline give a natural, simple Urdu headline in Urdu script: under 60 characters, the same facts and nothing added, no English letters (write English and foreign names in Urdu letters, e.g. آئی ایم ایف, اوپن اے آئی). Keep every figure exactly as digits. No quotation marks, no outlet names. Return JSON only: {"items":[{"id":"...","headlineUr":"..."}]}.`

/** Writes the Urdu headline of each story that has none and leaves it in Redis; a headline that cannot be read aloud or changes a figure is dropped. */
export async function processHeadlineJob(
  data: { stories: { id: string; title: string; dek?: string }[] },
  deps: { router: LLMRouter; redis: KV },
): Promise<{ written: string[] }> {
  const format = zodToJsonSchema(HeadlinesSchema, { target: 'openApi3' }) as Record<string, unknown>
  const res = await deps.router.chat('write_ur', {
    messages: [
      { role: 'system', content: HEADLINE_SYSTEM },
      { role: 'user', content: JSON.stringify(data.stories.map((s) => ({ id: s.id, headline: s.title, dek: s.dek ?? '' }))) },
    ],
    format,
    temperature: 0.3,
    maxTokens: 2048,
    timeoutMs: 120_000,
  })
  const parsed = HeadlinesSchema.parse(JSON.parse(extractJson(res.content)))
  const written: string[] = []
  for (const item of parsed.items) {
    const story = data.stories.find((s) => s.id === item.id)
    if (!story) continue
    const speech = toSpeechText(item.headlineUr)
    const badFigures = numbersNotInArticle(toLatinDigits(item.headlineUr), `${story.title} ${story.dek ?? ''}`)
    if (speech.unresolved.length || !speech.text || badFigures.length) continue
    await deps.redis.set(storyUrKey(item.id), JSON.stringify({ headlineUr: item.headlineUr.trim() }), 'EX', 7 * 86400)
    written.push(item.id)
  }
  return { written }
}

/** The video service's side: ask for the missing headlines and wait (at most waitMs) until they are in Redis. */
export async function requestHeadlines(
  deps: { redis: KV; queue: { add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown> }; sleep(ms: number): Promise<void>; now(): number },
  stories: { id: string; title: string; dek?: string }[],
  waitMs: number,
): Promise<void> {
  if (!stories.length) return
  await deps.queue.add('headlines', { stories }, { jobId: `headlines-${stories.map((s) => s.id).join('-')}-${Math.floor(deps.now() / 600_000)}`, attempts: 1, removeOnComplete: true, removeOnFail: true })
  const until = deps.now() + waitMs
  while (deps.now() < until) {
    await deps.sleep(4000)
    const have = await Promise.all(stories.map((s) => deps.redis.get(storyUrKey(s.id))))
    if (have.every(Boolean)) return
  }
}
