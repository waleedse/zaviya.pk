import type { LLMRouter } from '@zaviya/llm'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import { logger } from '../logger.js'

const triageDebounce = new Map<string, { itemCount: number; at: number }>()
const DEBOUNCE_MS = 10 * 60 * 1000
const EMBED_MAX_TRIES = 6
const EMBED_RETRY_DELAY_MS = 2 * 60 * 1000

export async function processEmbedJob(
  data: { sourceItemId: string; title: string; summary?: string; tries?: number },
  deps: { router: LLMRouter; payload: PayloadClient; triageQueue: Queue; embedQueue?: Queue; minSources?: number },
): Promise<void> {
  const text = `${data.title}\n${data.summary ?? ''}`.trim()
  let embedding: number[][]
  try {
    embedding = await deps.router.embed('embed', [text])
  } catch (e) {
    // Usually the free embedding quota: try again later instead of losing the item for clustering.
    const tries = (data.tries ?? 0) + 1
    if (deps.embedQueue && tries <= EMBED_MAX_TRIES) {
      await deps.embedQueue.add('embed', { ...data, tries }, { delay: EMBED_RETRY_DELAY_MS * tries })
      logger.debug({ err: e, tries }, 'embed deferred')
    } else {
      logger.warn({ err: e }, 'embed skipped — LLM unavailable')
    }
    return
  }
  const vec = embedding[0]
  if (!vec) return

  let match: { clusterId: string; isNew: boolean }
  try {
    match = await deps.payload.clusterMatch({
      sourceItemId: data.sourceItemId,
      embedding: vec,
    })
  } catch (e) {
    logger.warn({ err: e }, 'cluster-match failed')
    return
  }

  const cluster = await deps.payload.getCluster(match.clusterId).catch(() => null)
  if (!cluster) return

  const prev = triageDebounce.get(match.clusterId)
  const now = Date.now()
  // Triage costs local CPU time: wait until a second outlet confirms the story (tier-1 wires excepted),
  // and leave clusters alone while a decision on them is pending.
  const corroborated = cluster.distinctSources >= (deps.minSources ?? 2) || cluster.maxTier === 1
  if (!corroborated || ['rejected', 'in_review', 'writing'].includes(cluster.status)) return

  const itemCountChanged = !prev || prev.itemCount !== cluster.itemCount
  const debounceExpired = !prev || now - prev.at > DEBOUNCE_MS
  if (match.isNew || (itemCountChanged && debounceExpired)) {
    triageDebounce.set(match.clusterId, { itemCount: cluster.itemCount, at: now })
    await deps.triageQueue.add(
      'triage',
      { clusterId: match.clusterId },
      { priority: 5, removeOnComplete: 100 },
    )
  }
}
