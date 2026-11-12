import { z } from 'zod'
import { TriageResultSchema, repetitionCutoff, type TriageResult } from '@zaviya/shared'
import { zodToJsonSchema, isInputBlocked, type LLMRouter } from '@zaviya/llm'
import { triageSystemPrompt, triageUserPrompt } from '../prompts/triage.js'
import { logger } from '../logger.js'
import { parseModelJson } from './json-tolerant.js'

type ClusterForPrompt = Parameters<typeof triageUserPrompt>[0] & { id: string }

/** One entry per cluster, keyed by the id the prompt gave it. */
export const TriageBatchSchema = z.object({ results: z.array(TriageResultSchema.extend({ clusterId: z.string() })) })

export const BATCH_LIMITS = { items: 4, chars: 400 }
/** gemma often answers only some of a long list: 6 clusters a call kept more of them usable than 8 */
export const BATCH_MAX = 6

export function triageBatchSystemPrompt(): string {
  return `${triageSystemPrompt()}

You receive several independent clusters, each inside <cluster id="...">. Score each one on its own; do not let one cluster influence another.
Return {"results":[...]} with exactly one entry per cluster, each carrying that cluster's id as "clusterId" plus the fields above. Output JSON only.`
}

export function triageBatchUserPrompt(clusters: ClusterForPrompt[]): string {
  return clusters
    .map((c) => `<cluster id="${c.id}">\n${triageUserPrompt(c, BATCH_LIMITS)}\n</cluster>`)
    .join('\n\n')
}

interface Pending {
  cluster: ClusterForPrompt
  resolve: (r: TriageResult | null) => void
  reject: (e: unknown) => void
}

/**
 * Scores several clusters in ONE Gemini call (the free daily quota is counted in calls, not tokens, and triage was
 * the biggest spender). Jobs that are not trending wait here for up to `windowMs` or until `max` are collected.
 * `score` resolves with null when the model did not return a usable entry for that cluster (or the batch had a
 * single cluster, or the model refused the batch text): the caller then asks for that one cluster on its own.
 */
export class TriageBatcher {
  private pending: Pending[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly router: Pick<LLMRouter, 'chat'>,
    private readonly opts: { max?: number; windowMs?: number; timeoutMs?: number } = {},
  ) {}

  score(cluster: ClusterForPrompt): Promise<TriageResult | null> {
    return new Promise((resolve, reject) => {
      this.pending.push({ cluster, resolve, reject })
      if (this.pending.length >= (this.opts.max ?? BATCH_MAX)) void this.flush()
      else if (!this.timer) this.timer = setTimeout(() => void this.flush(), this.opts.windowMs ?? 20_000)
    })
  }

  private async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const batch = this.pending.splice(0, this.opts.max ?? BATCH_MAX)
    if (this.pending.length) this.timer = setTimeout(() => void this.flush(), 0)
    if (!batch.length) return
    // One cluster alone gains nothing from a batch prompt: the single-cluster path handles it
    if (batch.length === 1) return batch[0]!.resolve(null)
    try {
      const format = zodToJsonSchema(TriageBatchSchema, { target: 'openApi3' }) as Record<string, unknown>
      const res = await this.router.chat('triage', {
        messages: [
          { role: 'system', content: triageBatchSystemPrompt() },
          { role: 'user', content: triageBatchUserPrompt(batch.map((b) => b.cluster)) },
        ],
        format,
        maxTokens: 400 * batch.length + 200,
        timeoutMs: this.opts.timeoutMs ?? 180_000,
      })
      const byId = new Map<string, TriageResult>()
      try {
        // gemma wraps its JSON in a code fence: a plain JSON.parse failed for 22 of 38 batches on 12 Nov
        const parsed = parseModelJson(res.content) as { results?: unknown }
        for (const raw of Array.isArray(parsed.results) ? parsed.results : []) {
          const id = String((raw as { clusterId?: unknown }).clusterId ?? '')
          const reason = (raw as { reason?: unknown }).reason
          // a looping reason is unreadable: that cluster is asked again on its own
          if (typeof reason === 'string' && repetitionCutoff(reason) !== null) continue
          const ok = TriageResultSchema.safeParse(raw)
          if (ok.success && !byId.has(id)) byId.set(id, ok.data)
        }
      } catch {
        // unusable JSON: every cluster falls back to its own call
      }
      logger.info({ clusters: batch.length, scored: byId.size }, 'triage batch scored')
      for (const b of batch) b.resolve(byId.get(b.cluster.id) ?? null)
    } catch (e) {
      // One cluster's text can make the model refuse the whole batch: let each cluster find out on its own
      if (isInputBlocked(e)) return void batch.forEach((b) => b.resolve(null))
      // quota and everything else: every job in the batch handles it the way a single call would
      batch.forEach((b) => b.reject(e))
    }
  }
}
