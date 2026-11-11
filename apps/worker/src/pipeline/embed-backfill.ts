import type { LLMRouter } from '@zaviya/llm'
import type { PayloadClient } from '../payload-client.js'
import { logger } from '../logger.js'

const BATCH = 32
const MAX_BATCHES = 400

/**
 * After a switch of embedding model the items of the last N hours still carry vectors from the old model, which the
 * cluster match no longer compares against. Re-embed them (newest first) so a story that broke before the switch still
 * absorbs its follow-ups instead of starting a duplicate cluster. Safe to run on every start: it stops at once when
 * nothing carries another model's vector. Never throws.
 */
export async function runEmbedBackfill(deps: { router: LLMRouter; payload: PayloadClient; hours: number }): Promise<{ done: number }> {
  if (deps.hours <= 0) return { done: 0 }
  const model = deps.router.embedModelId()
  let done = 0
  try {
    for (let i = 0; i < MAX_BATCHES; i++) {
      const { items } = await deps.payload.reembedCandidates(model, deps.hours, BATCH)
      if (!items.length) break
      const vectors = await deps.router.embed('embed', items.map((it) => `${it.title}\n${it.summary ?? ''}`.trim()))
      const { stored } = await deps.payload.storeReembedded(
        model,
        items.map((it, n) => ({ id: it.id, embedding: vectors[n]! })),
      )
      if (!stored) break // nothing was written: do not spin on the same batch
      done += stored
    }
    logger.info({ model, done }, 'embedding backfill finished')
  } catch (e) {
    logger.warn({ err: e, model, done }, 'embedding backfill stopped (it resumes on the next start)')
  }
  return { done }
}
