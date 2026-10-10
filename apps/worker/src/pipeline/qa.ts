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
  issues.push(...checkUrduLocale(write.ur.bodyMarkdown))

  let llmPass = true
  try {
    const format = zodToJsonSchema(QAResultSchema, { target: 'openApi3' }) as Record<string, unknown>
    const res = await router.chat('qa', {
      messages: [
        { role: 'system', content: qaSystemPrompt() },
        {
          role: 'user',
          content: `Sources:\n${sources.join('\n---\n')}\n\nEN:\n${write.en.bodyMarkdown}\n\nUR:\n${write.ur.bodyMarkdown}`,
        },
      ],
      format,
    })
    const qa = QAResultSchema.parse(JSON.parse(res.content))
    llmPass = qa.pass
    if (qa.unsupportedClaims.length) {
      issues.push(...qa.unsupportedClaims.map((c) => `Unsupported: ${c}`))
    }
    if (qa.styleIssues.length) issues.push(...qa.styleIssues)
  } catch (e) {
    logger.warn({ err: e }, 'QA LLM skipped')
  }

  const pass = issues.length === 0 && llmPass
  const qaScore = pass ? 1 : Math.max(0, 1 - issues.length * 0.15)
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
        { clusterId: data.clusterId, attempt: attempt + 1 },
        { priority: 3 },
      )
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
