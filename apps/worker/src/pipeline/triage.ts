import { TriageResultSchema, type TriageResult } from '@zaviya/shared'
import { zodToJsonSchema, isQuotaExhausted } from '@zaviya/llm'
import type { LLMRouter } from '@zaviya/llm'
import type { Queue } from 'bullmq'
import type { PayloadClient } from '../payload-client.js'
import { triageSystemPrompt, triageUserPrompt, TRIAGE_PROMPT_VERSION } from '../prompts/triage.js'
import { applyTriageRules } from './triage-rules.js'
import { logger } from '../logger.js'
import { hasFreshSource, shouldPitch } from './pitch.js'
import { findSameStory } from './same-story.js'

export async function processTriageJob(
  data: { clusterId: string },
  deps: {
    router: LLMRouter
    payload: PayloadClient
    writeQueue: Queue
    triageQueue?: Queue
    autoApprove?: 'off' | 'safe' | 'all'
    /** Pitch normal stories to the editor instead of writing them at once */
    pitch?: boolean
    notifyReview?: (args: { clusterId: string; reviewId: string; summary: string }) => Promise<void>
  },
): Promise<void> {
  const cluster = await deps.payload.getCluster(data.clusterId)
  const settings = await deps.payload.getSettings().catch(() => ({}) as import('../payload-client.js').PipelineSettings)

  let triage: TriageResult
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
    if (isQuotaExhausted(e)) {
      // Out of quota is not a verdict on the story: look at it again once the first model frees up,
      // otherwise the cluster sits in `new` until another item happens to arrive.
      const delay = Math.min(Math.max(e.resetAt - Date.now(), 60_000), 60 * 60_000) + 5_000
      await deps.triageQueue?.add('triage', { clusterId: data.clusterId }, { delay, priority: 4, jobId: `triage-retry-${data.clusterId}`, removeOnComplete: true })
      logger.info({ clusterId: data.clusterId, delayMs: delay }, 'triage quota exhausted, requeued')
      return
    }
    logger.warn({ err: e, clusterId: data.clusterId }, 'triage LLM skipped/failed')
    return
  }

  // Same event as an article we already hold (ZAV-134): add it to that article as a live update, never a
  // second article. Nothing already published is touched; a miss here only falls back to the old path.
  if (!triage.isUpdateOfExisting) {
    try {
      const recent = await deps.payload.recentArticles()
      const titles = [cluster.headline, ...cluster.items.map((it) => it.title)].filter((t): t is string => Boolean(t))
      const verdict = findSameStory(titles, recent)
      if (verdict.kind === 'skip') {
        await deps.payload.patchCluster(data.clusterId, {
          status: 'rejected',
          triage: { ...triage, codeOutcome: 'reject', deferReason: verdict.reason, existingArticleId: verdict.article.id },
        })
        logger.info({ clusterId: data.clusterId, articleId: verdict.article.id, reason: verdict.reason }, 'triage: same story as an existing article, not written')
        return
      }
      if (verdict.kind === 'update') {
        triage = { ...triage, isUpdateOfExisting: true, existingArticleId: verdict.article.id }
        logger.info({ clusterId: data.clusterId, articleId: verdict.article.id }, 'triage: same story as a live article, routed to an update')
      }
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : e, clusterId: data.clusterId }, 'same-story check failed, continuing')
    }
  }

  const decision = applyTriageRules(triage, {
    maxTier: cluster.maxTier,
    distinctSources: cluster.distinctSources,
    settings,
    lastPublishedAt: settings.lastPublishedAt,
    articlesPublishedToday: settings.articlesPublishedToday,
  })

  if (decision.outcome === 'defer') {
    // Pacing, not quality: look at it again later (new sources may have arrived by then).
    const ageH = (Date.now() - new Date(cluster.items[0]?.publishedAt ?? Date.now()).getTime()) / 3_600_000
    if (ageH < 18) {
      await deps.triageQueue?.add('triage', { clusterId: data.clusterId }, { delay: decision.retryInMs ?? 30 * 60_000, priority: 4 })
    }
    await deps.payload.patchCluster(data.clusterId, {
      status: 'triaged',
      triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: decision.outcome, deferReason: decision.reason },
    })
    return
  }

  await deps.payload.patchCluster(data.clusterId, {
    status: decision.outcome === 'reject' ? 'rejected' : 'triaged',
    triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: decision.outcome },
  })

  if (decision.outcome === 'reject') return

  // Auto-approve: sensitive-topic stories go straight to writing (QA still checks every fact).
  const neverAuto = deps.autoApprove === 'all' ? [] : ['blasphemy', 'minor']
  if (
    decision.outcome === 'review' &&
    deps.autoApprove &&
    deps.autoApprove !== 'off' &&
    !triage.sensitivityFlags.some((f) => neverAuto.includes(f)) &&
    decision.weightedScore >= (settings.thresholds?.review ?? 0.5)
  ) {
    decision.outcome = 'publish'
    decision.reason = `auto-approved (${decision.reason})`
  }

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

  if (!triage.isUpdateOfExisting && !hasFreshSource(cluster.items)) {
    await deps.payload.patchCluster(data.clusterId, { status: 'rejected', triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: 'reject', deferReason: 'stale sources' } })
    logger.info({ clusterId: data.clusterId }, 'rejected: no source from the last 48 hours')
    return
  }

  if (shouldPitch({ pitch: Boolean(deps.pitch), priority: triage.suggestedPriority, isUpdate: triage.isUpdateOfExisting })) {
    await deps.payload.patchCluster(data.clusterId, {
      status: 'triaged',
      triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: 'pitch', pitchedAt: new Date().toISOString() },
    })
    logger.info({ clusterId: data.clusterId, priority: triage.suggestedPriority }, 'pitched to the editor')
    return
  }

  await deps.payload.patchCluster(data.clusterId, { status: 'writing' })
  await deps.writeQueue.add(
    'write',
    { clusterId: data.clusterId, triage, promptVersion: TRIAGE_PROMPT_VERSION },
    { priority: triage.suggestedPriority === 'breaking' ? 1 : triage.suggestedPriority === 'high' ? 3 : 5 },
  )
}
