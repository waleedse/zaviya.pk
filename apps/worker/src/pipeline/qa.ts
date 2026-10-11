import { QAResultSchema } from '@zaviya/shared'
import { zodToJsonSchema } from '@zaviya/llm'
import type { LLMRouter } from '@zaviya/llm'
import type { Queue } from 'bullmq'
import type { WriteResult } from './write.js'
import {
  checkBannedAndClickbait,
  checkLength,
  checkOriginality,
  checkUrduLocale,
} from './qa-checks.js'
import { checkKeywordUsage } from './seo.js'
import { qaSystemPrompt, QA_PROMPT_VERSION } from '../prompts/qa.js'
import { logger } from '../logger.js'
import type { PayloadClient } from '../payload-client.js'
import type { Priority } from '@zaviya/shared'

export interface QaJobResult {
  pass: boolean
  issues: string[]
  qaScore: number
}

export async function runQaChecks(
  write: WriteResult,
  sources: string[],
  priority: Priority,
  router: LLMRouter,
): Promise<QaJobResult> {
  const issues: string[] = []

  issues.push(...checkOriginality(write.en.bodyMarkdown, sources))
  issues.push(...checkLength(write.en.bodyMarkdown, priority))
  issues.push(...checkBannedAndClickbait(write.en.title, write.en.bodyMarkdown))
  if (write.ur) issues.push(...checkUrduLocale(write.ur.bodyMarkdown))

  let llmPass = true
  try {
    const format = zodToJsonSchema(QAResultSchema, { target: 'openApi3' }) as Record<string, unknown>
    const res = await router.chat('qa', {
      messages: [
        { role: 'system', content: qaSystemPrompt() },
        {
          role: 'user',
          // English article vs the full sources: truncated sources made true facts look "unsupported".
          content: `Sources:\n${sources.map((x) => x.slice(0, 6000)).slice(0, 6).join('\n---\n')}\n\nARTICLE:\n${write.en.bodyMarkdown}`,
        },
      ],
      format,
      maxTokens: 800,
    })
    const qa = QAResultSchema.parse(JSON.parse(res.content))
    // Only invented facts block publishing; a small model's style opinions are logged, not enforced.
    llmPass = qa.unsupportedClaims.length === 0
    if (qa.unsupportedClaims.length) {
      issues.push(...qa.unsupportedClaims.map((c) => `Unsupported: ${c}`))
    }
    if (qa.styleIssues.length) logger.info({ styleIssues: qa.styleIssues.slice(0, 3) }, 'QA style notes (non-blocking)')
  } catch (e) {
    logger.warn({ err: e }, 'QA LLM skipped')
  }

  // Missing keywords are only reported; stuffing and broken capitalisation must be fixed before publishing.
  const seoIssues = write.seo ? checkKeywordUsage(write.seo, write.en) : []
  const blocking = seoIssues.filter((i) => /stuffing|capitalised/.test(i))
  const pass = issues.length === 0 && blocking.length === 0 && llmPass
  issues.push(...seoIssues)
  const qaScore = Math.max(0, 1 - issues.length * 0.1)
  void QA_PROMPT_VERSION
  return { pass, issues, qaScore }
}

export async function processQaJob(
  data: { clusterId: string; write: WriteResult; priority: Priority; attempt?: number },
  deps: {
    router: LLMRouter
    payload: PayloadClient
    writeQueue: Queue
    mediaQueue: Queue
    autoApprove?: 'off' | 'safe' | 'all'
    notifyReview?: (args: { clusterId: string; reviewId: string; summary: string }) => Promise<void>
  },
): Promise<void> {
  const cluster = await deps.payload.getCluster(data.clusterId)
  const sources = cluster.items.map((i) => i.contentText ?? i.summary ?? i.title)
  const result = await runQaChecks(data.write, sources, data.priority, deps.router)
  const attempt = data.attempt ?? 0

  if (!result.pass) {
    if (attempt < 2) {
      await deps.writeQueue.add(
        'write-retry',
        { clusterId: data.clusterId, attempt: attempt + 1, feedback: result.issues, priority: data.priority },
        { priority: 3 },
      )
      return
    }
    if (deps.autoApprove && deps.autoApprove !== 'off') {
      // Nobody is waiting on a review queue: publish if only style/SEO/length remain, drop if facts don't check out.
      const factual = result.issues.filter((i) => /^Unsupported|originality|overlap|copied/i.test(i))
      if (!factual.length) {
        await deps.mediaQueue.add('media', { clusterId: data.clusterId, write: data.write, qaScore: result.qaScore, priority: data.priority }, { priority: 5 })
      } else {
        await deps.payload.patchCluster(data.clusterId, { status: 'rejected' })
        logger.warn({ clusterId: data.clusterId, issues: factual.slice(0, 3) }, 'dropped after QA: unsupported claims')
      }
      return
    }
    const review = await deps.payload.postReview({
      clusterId: data.clusterId,
      reason: `QA failed: ${result.issues.slice(0, 3).join('; ')}`,
      flags: ['unverified'],
    })
    await deps.notifyReview?.({
      clusterId: data.clusterId,
      reviewId: review.id,
      summary: result.issues.join('\n'),
    })
    await deps.payload.patchCluster(data.clusterId, { status: 'in_review' })
    return
  }

  await deps.mediaQueue.add(
    'media',
    { clusterId: data.clusterId, write: data.write, qaScore: result.qaScore, priority: data.priority },
    { priority: data.priority === 'breaking' ? 1 : 5 },
  )
}
