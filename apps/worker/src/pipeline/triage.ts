import { TriageResultSchema } from '@zaviya/shared'
import { zodToJsonSchema } from '@zaviya/llm'
import type { LLMRouter } from '@zaviya/llm'
import type { Queue } from 'bullmq'
import type { PayloadClient } from '../payload-client.js'
import { triageSystemPrompt, triageUserPrompt, TRIAGE_PROMPT_VERSION } from '../prompts/triage.js'
import { applyTriageRules } from './triage-rules.js'
import { logger } from '../logger.js'

export async function processTriageJob(
  data: { clusterId: string },
  deps: {
    router: LLMRouter
    payload: PayloadClient
    writeQueue: Queue
    notifyReview?: (args: { clusterId: string; reviewId: string; summary: string }) => Promise<void>
  },
): Promise<void> {
  const cluster = await deps.payload.getCluster(data.clusterId)
  const settings = await deps.payload.getSettings().catch(() => ({}) as import('../payload-client.js').PipelineSettings)

  let triage
  try {
    const format = zodToJsonSchema(TriageResultSchema, { target: 'openApi3' }) as Record<string, unknown>
    const timeoutMs = 180_000
    const result = await deps.router.chat('triage', {
      messages: [
        { role: 'system', content: triageSystemPrompt() },
        { role: 'user', content: triageUserPrompt(cluster) },
      ],
      format,
      timeoutMs,
    })
    triage = TriageResultSchema.parse(JSON.parse(result.content))
  } catch (e) {
    logger.warn({ err: e, clusterId: data.clusterId }, 'triage LLM skipped/failed')
    return
  }

  const decision = applyTriageRules(triage, {
    maxTier: cluster.maxTier,
    distinctSources: cluster.distinctSources,
    settings,
    lastPublishedAt: settings.lastPublishedAt,
    articlesPublishedToday: settings.articlesPublishedToday,
  })

  await deps.payload.patchCluster(data.clusterId, {
    status: decision.outcome === 'reject' ? 'rejected' : 'triaged',
    triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: decision.outcome },
  })

  if (decision.outcome === 'reject') return

  if (decision.outcome === 'review') {
    const review = await deps.payload.postReview({
      clusterId: data.clusterId,
      reason: decision.reason,
      flags: triage.sensitivityFlags,
    })
    await deps.notifyReview?.({
      clusterId: data.clusterId,
      reviewId: review.id,
      summary: `${cluster.headline ?? cluster.items[0]?.title ?? 'Story'}\n${decision.reason}`,
    })
    await deps.payload.patchCluster(data.clusterId, { status: 'in_review' })
    return
  }

  await deps.payload.patchCluster(data.clusterId, { status: 'writing' })
  await deps.writeQueue.add(
    'write',
    { clusterId: data.clusterId, triage, promptVersion: TRIAGE_PROMPT_VERSION },
    { priority: triage.suggestedPriority === 'breaking' ? 1 : triage.suggestedPriority === 'high' ? 3 : 5 },
  )
}
