/** The main worker's side of an explainer: write the script and leave it in Redis for the video service. */
import type { LLMRouter } from '@zaviya/llm'
import type { Idea } from './ideas.js'
import { writeExplainerScript, type ScriptResult } from './script.js'

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
