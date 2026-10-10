import type { LLMRouter } from '@zaviya/llm'
import type { PayloadClient } from '../payload-client.js'
import type { Queue } from 'bullmq'
import { logger } from '../logger.js'

const triageDebounce = new Map<string, { itemCount: number; at: number }>()
const DEBOUNCE_MS = 10 * 60 * 1000

export async function processEmbedJob(
  data: { sourceItemId: string; title: string; summary?: string },
  deps: { router: LLMRouter; payload: PayloadClient; triageQueue: Queue },
): Promise<void> {
  const text = `${data.title}\n${data.summary ?? ''}`.trim()
  let embedding: number[][]
  try {
    embedding = await deps.router.embed('embed', [text])
  } catch (e) {
    logger.warn({ err: e }, 'embed skipped — LLM unavailable')
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
