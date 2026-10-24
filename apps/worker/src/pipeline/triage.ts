import { TriageResultSchema, repetitionCutoff, type TriageResult } from '@zaviya/shared'
import { zodToJsonSchema, isQuotaExhausted, isInputBlocked } from '@zaviya/llm'
import type { LLMRouter } from '@zaviya/llm'
import type { Queue } from 'bullmq'
import type { PayloadClient } from '../payload-client.js'
import { triageSystemPrompt, triageUserPrompt, TRIAGE_PROMPT_VERSION } from '../prompts/triage.js'
import { applyTriageRules } from './triage-rules.js'
import { logger } from '../logger.js'
import { hasFreshSource, pitchSummary, shouldPitch } from './pitch.js'
import { enrichFromExtension } from './write.js'
import type { BridgeServer } from '../bridge/server.js'
import { findSameStory } from './same-story.js'
import { opinionCue, routeByStoryKind } from './story-kind.js'

class ReasonLoopError extends Error {
  constructor() {
    super('triage reason is a repetition loop')
  }
}

export const HEADLINE_ONLY_REJECT = 'headline only: the article body could not be read, so it is not pitched'
export const HEADLINE_ONLY_WAITING = 'headline only: waiting for the extension to read the article'
/** With the extension offline a headline-only cluster is retried hourly while the newest source is under 4 h old (ZAV-163). */
export const HEADLINE_ONLY_RETRY_MIN = 60
export const HEADLINE_ONLY_WAIT_H = 4

function newestSourceMs(items: { publishedAt?: string }[]): number {
  const times = items.map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : NaN)).filter(Number.isFinite)
  return times.length ? Math.max(...times) : 0
}

/** A deferred cluster that nobody has looked at for this long lost its retry job (normal retries are 15-60 min). */
export const DEFER_RELEASE_MIN = 20

/**
 * ZAV-144: a cluster deferred for pacing used to depend on one delayed retry job. If that job failed (LLM timeout,
 * restart, quota) the cluster stayed 'triaged' forever. This sweep puts every such cluster back on the triage queue;
 * the job id makes sure a cluster is queued once per 15-minute slot. Breaking news is never deferred, so it is not here.
 */
export async function releaseDeferredClusters(
  deps: { payload: Pick<PayloadClient, 'deferredClusters'>; triageQueue: Pick<Queue, 'add'> },
  now = Date.now(),
): Promise<number> {
  const { clusters } = await deps.payload.deferredClusters(DEFER_RELEASE_MIN)
  const slot = Math.floor(now / (15 * 60_000))
  let released = 0
  for (const c of clusters) {
    await deps.triageQueue.add('triage', { clusterId: c.id }, { priority: 4, jobId: `triage-release-${c.id}-${slot}`, removeOnComplete: true })
    logger.info({ clusterId: c.id, reason: c.reason }, 'deferred cluster released')
    released++
  }
  return released
}

/** A lone tier 1-2 cluster that no second outlet joined for this long goes to triage anyway (ZAV-147). */
export const LONELY_TRIAGE_MIN = 180

/**
 * ZAV-147: embed only queues triage when a cluster is corroborated at the moment an item arrives. A cluster that was
 * 'new' when its triage job was lost, or that stayed with one outlet (petrol cut 9728), was never looked at again.
 * This sweep queues them, once per 15-minute slot per cluster, and triage decides what they are.
 */
export async function releaseStuckNewClusters(
  deps: { payload: Pick<PayloadClient, 'stuckNewClusters'>; triageQueue: Pick<Queue, 'add'>; minSources?: number },
  now = Date.now(),
): Promise<number> {
  const { clusters } = await deps.payload.stuckNewClusters(DEFER_RELEASE_MIN, LONELY_TRIAGE_MIN, deps.minSources ?? 2)
  const slot = Math.floor(now / (15 * 60_000))
  for (const c of clusters) {
    await deps.triageQueue.add('triage', { clusterId: c.id }, { priority: 4, jobId: `triage-new-${c.id}-${slot}`, removeOnComplete: true })
    logger.info({ clusterId: c.id, sources: c.distinctSources }, 'stuck new cluster queued for triage')
  }
  return clusters.length
}

export async function processTriageJob(
  data: { clusterId: string },
  deps: {
    router: LLMRouter
    payload: PayloadClient
    writeQueue: Queue
    triageQueue?: Queue
    autoApprove?: 'off' | 'safe' | 'all'
    /** Chrome extension bridge: reads the lede of headline-only sources at pitch time (ZAV-149) */
    bridge?: Pick<BridgeServer, 'isOnline' | 'send'>
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
    const ask = async (limits: { items: number; chars: number }, final = false) => {
      const result = await deps.router.chat('triage', {
        messages: [
          { role: 'system', content: triageSystemPrompt() },
          { role: 'user', content: triageUserPrompt(cluster, limits) },
        ],
        format,
        // A verdict is a few hundred tokens; a cap stops a runaway reply from being cut mid-string (ZAV-21)
        maxTokens: 2048,
        timeoutMs,
      })
      const raw = JSON.parse(result.content) as { reason?: unknown }
      // ZAV-200: a reason stuck in a repetition loop is unreadable; ask again once, the schema cuts it if it loops again
      if (!final && typeof raw.reason === 'string' && repetitionCutoff(raw.reason) !== null) throw new ReasonLoopError()
      return TriageResultSchema.parse(raw)
    }
    try {
      triage = await ask({ items: 8, chars: 700 })
    } catch (e) {
      if (!(e instanceof SyntaxError) && !(e instanceof ReasonLoopError)) throw e
      logger.info({ clusterId: data.clusterId, loop: e instanceof ReasonLoopError }, 'triage reply was not usable (invalid JSON or a looping reason), retrying with a smaller prompt')
      triage = await ask({ items: 3, chars: 300 }, true)
    }
  } catch (e) {
    if (isQuotaExhausted(e)) {
      // Out of quota is not a verdict on the story: look at it again once the first model frees up,
      // otherwise the cluster sits in `new` until another item happens to arrive.
      const delay = Math.min(Math.max(e.resetAt - Date.now(), 60_000), 60 * 60_000) + 5_000
      await deps.triageQueue?.add('triage', { clusterId: data.clusterId }, { delay, priority: 4, jobId: `triage-retry-${data.clusterId}`, removeOnComplete: true })
      logger.info({ clusterId: data.clusterId, delayMs: delay }, 'triage quota exhausted, requeued')
      return
    }
    if (isInputBlocked(e)) {
      // The model refuses this text itself (violence, "sensitive words"): asking again can never work and the 15-minute
      // sweep would queue it forever, so close it with a reason the editor can see in the rejects (ZAV-182).
      await deps.payload.patchCluster(data.clusterId, {
        status: 'rejected',
        triage: { codeOutcome: 'reject', deferReason: 'model blocked the input: every Gemini model refused the prompt' },
      })
      logger.info({ clusterId: data.clusterId, model: e.model }, 'triage: model blocked the input, cluster rejected')
      return
    }
    logger.warn({ err: e, clusterId: data.clusterId }, 'triage LLM skipped/failed')
    return
  }

  // Opinion is not news and a feature about an event abroad is not Pakistan news (ZAV-155)
  const kind = routeByStoryKind(triage, cluster.items)
  if (kind.action === 'reject') {
    await deps.payload.patchCluster(data.clusterId, {
      status: 'rejected',
      triage: { ...triage, codeOutcome: 'reject', deferReason: kind.reason },
    })
    logger.info({ clusterId: data.clusterId, storyKind: triage.storyKind, reason: kind.reason }, 'triage: not a news report, rejected')
    return
  }
  triage = kind.triage

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
    // Pacing, not quality: look at it again later (new sources may have arrived by then). ZAV-179: pacing alone never
    // rejects a story. It used to close the cluster once the FIRST item was 18 h old, which lost fresh tier-1 stories
    // (a cluster keeps its oldest item first). Only a cluster whose newest dated source is past the freshness limit is
    // closed, and then for being stale (the publish step would refuse it anyway), not for the pacing.
    const newest = newestSourceMs(cluster.items)
    if (newest > 0 && !hasFreshSource(cluster.items)) {
      await deps.payload.patchCluster(data.clusterId, {
        status: 'rejected',
        triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: 'reject', deferReason: `stale sources: no source from the last 18 hours (was deferred: ${decision.reason})` },
      })
      return
    }
    await deps.triageQueue?.add('triage', { clusterId: data.clusterId }, { delay: decision.retryInMs ?? 30 * 60_000, priority: 4 })
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
    logger.info({ clusterId: data.clusterId }, 'rejected: no source from the last 18 hours')
    return
  }

  if (shouldPitch({ pitch: Boolean(deps.pitch), priority: triage.suggestedPriority, isUpdate: triage.isUpdateOfExisting })) {
    // ZAV-149: a pitch carries the lede. Headline-only sources (Dawn via Google News) are read through the extension.
    let items = cluster.items
    try {
      if (!pitchSummary(items) && deps.bridge?.isOnline() && (await enrichFromExtension(items, deps.payload, deps.bridge, data.clusterId, 1))) {
        items = (await deps.payload.getCluster(data.clusterId)).items
      }
    } catch (e) {
      logger.warn({ clusterId: data.clusterId, err: e instanceof Error ? e.message : e }, 'pitch summary enrichment failed')
    }
    // The text read through the extension may show an editorial that the headline did not (ZAV-155)
    const cue = opinionCue(items)
    if (cue) {
      await deps.payload.patchCluster(data.clusterId, {
        status: 'rejected',
        triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: 'reject', deferReason: cue },
      })
      logger.info({ clusterId: data.clusterId, reason: cue }, 'rejected: the article text is opinion')
      return
    }
    const lede = pitchSummary(items)
    // ZAV-163: a pitch with no body (a Google News link whose article text could not be read) would be written, or
    // approved and then withdrawn, from a headline alone. The worker closes it itself with a note.
    if (!lede) {
      const ageH = (Date.now() - newestSourceMs(items)) / 3_600_000
      if (!deps.bridge?.isOnline() && ageH < HEADLINE_ONLY_WAIT_H && deps.triageQueue) {
        // The extension is offline, so the page could not even be tried: look again later instead of binning it
        await deps.triageQueue.add('triage', { clusterId: data.clusterId }, { delay: HEADLINE_ONLY_RETRY_MIN * 60_000, priority: 4, jobId: `triage-body-${data.clusterId}-${Math.floor(Date.now() / (HEADLINE_ONLY_RETRY_MIN * 60_000))}`, removeOnComplete: true })
        await deps.payload.patchCluster(data.clusterId, {
          status: 'triaged',
          triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: 'defer', deferReason: HEADLINE_ONLY_WAITING },
        })
        logger.info({ clusterId: data.clusterId }, 'headline-only: waiting for the extension to read the article')
        return
      }
      await deps.payload.patchCluster(data.clusterId, {
        status: 'rejected',
        triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: 'reject', deferReason: HEADLINE_ONLY_REJECT },
      })
      logger.info({ clusterId: data.clusterId }, 'rejected: headline-only, no article body could be read')
      return
    }
    await deps.payload.patchCluster(data.clusterId, {
      status: 'triaged',
      triage: { ...triage, weightedScore: decision.weightedScore, codeOutcome: 'pitch', pitchedAt: new Date().toISOString(), pitchSummary: lede },
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
