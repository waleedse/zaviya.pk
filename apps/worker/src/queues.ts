import { Queue, Worker, type ConnectionOptions } from 'bullmq'
import { LLMRouter } from '@zaviya/llm'
import type { WorkerEnv } from './config.js'
import { PayloadClient } from './payload-client.js'
import { logger } from './logger.js'
import { processEmbedJob } from './pipeline/embed.js'
import { processTriageJob } from './pipeline/triage.js'
import { processWriteJob } from './pipeline/write.js'
import { processQaJob } from './pipeline/qa.js'
import { processMediaJob } from './pipeline/media.js'
import { processPublishJob } from './pipeline/publish.js'
import { fetchRssFeed, toSourceItemInputs } from './ingest/rss.js'
import { isAllowedByRobots } from './ingest/robots.js'
import { fetchArticleText } from './ingest/extract.js'
import { fetchCuratedTweets } from './ingest/x.js'
import { postFacebook } from './social/facebook.js'
import { postInstagram } from './social/instagram.js'
import { postX } from './social/x.js'
import { fetchRatePoints, postRatePoints } from './data/rates.js'
import type { BridgeServer } from './bridge/server.js'
import type { TelegramAlerts } from './telegram/bot.js'
import { sendReviewCard } from './telegram/bot.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import type { WriteResult } from './pipeline/write.js'

export const QUEUE_NAMES = [
  'ingest',
  'embed',
  'triage',
  'write',
  'qa',
  'media',
  'publish',
  'social',
  'data',
  'metrics',
] as const

export type QueueName = (typeof QUEUE_NAMES)[number]

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
}

export interface WorkerRuntime {
  env: WorkerEnv
  payload: PayloadClient
  router: LLMRouter
  bridge: BridgeServer
  telegram: TelegramAlerts
  queues: Record<QueueName, Queue>
  workers: Worker[]
  paused: boolean
}

export function createConnection(env: WorkerEnv): ConnectionOptions {
  return { url: env.REDIS_URL, maxRetriesPerRequest: null }
}

export async function createWorkerRuntime(
  env: WorkerEnv,
  bridge: BridgeServer,
  telegram: TelegramAlerts,
): Promise<WorkerRuntime> {
  const connection = createConnection(env)
  const payload = new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY)
  const router = new LLMRouter({
    ollamaUrl: env.OLLAMA_URL,
    geminiApiKey: env.GEMINI_API_KEY,
  })

  try {
    const settings = await payload.getSettings()
    router.updateSettings({ activeModels: settings.activeModels as Record<string, string> | undefined })
  } catch (e) {
    logger.warn({ err: e }, 'Could not load settings — using defaults')
  }

  const queues = Object.fromEntries(
    QUEUE_NAMES.map((name) => [name, new Queue(name, { connection, defaultJobOptions: defaultJobOpts })]),
  ) as Record<QueueName, Queue>

  const notifyReview = async (args: { clusterId: string; reviewId: string; summary: string }) => {
    await sendReviewCard(telegram, args)
  }

  const workers: Worker[] = []

  workers.push(
    new Worker(
      'ingest',
      async (job) => {
        if (job.name === 'x-poll') {
          const ids = (env.X_CURATED_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
          if (!env.X_BEARER_TOKEN) return
          await fetchCuratedTweets(ids, env.X_BEARER_TOKEN)
          return
        }
        const { sourceId, url, type, etag, lang } = job.data as {
          sourceId: string
          url: string
          type: string
          etag?: string
          lang?: string
        }
        if (type !== 'rss' && type !== 'gnews') {
          logger.debug({ type }, 'ingest type not rss — skip')
          return
        }
        const feed = await fetchRssFeed(url, { etag })
        if (!feed.notModified && feed.items.length) {
          const inputs = toSourceItemInputs(sourceId, feed.items)
          for (const item of inputs) {
            if (await isAllowedByRobots(item.url)) {
              const text = await fetchArticleText(item.url)
              if (text) item.contentText = text
            }
          }
          const res = await payload.postSourceItems(inputs)
          for (const ins of res.inserted) {
            const item = inputs.find((i) => i.externalId === ins.externalId)
            if (item) {
              await queues.embed.add('embed', {
                sourceItemId: ins.id,
                title: item.title,
                summary: item.summary,
              })
            }
          }
        }
        await payload.patchSource(sourceId, {
          etag: feed.etag,
          lastPolledAt: new Date().toISOString(),
        })
      },
      { connection, concurrency: 4 },
    ),
  )

  workers.push(
    new Worker('embed', async (job) => processEmbedJob(job.data, { router, payload, triageQueue: queues.triage }), {
      connection,
      concurrency: 2,
    }),
  )

  workers.push(
    new Worker(
      'triage',
      async (job) =>
        processTriageJob(job.data, {
          router,
          payload,
          writeQueue: queues.write,
          notifyReview,
        }),
      { connection, concurrency: 1 },
    ),
  )

  const writeStore = new Map<string, WriteResult>()

  workers.push(
    new Worker(
      'write',
      async (job) => {
        const { clusterId, attempt } = job.data as { clusterId: string; attempt?: number }
        if (job.name === 'write-retry' && attempt !== undefined) {
          logger.info({ clusterId, attempt }, 'write retry from QA')
        }
        const result = await processWriteJob({ clusterId }, { router, payload, env })
        if (!result) return
        writeStore.set(clusterId, result)
        const triage = (job.data as { triage?: TriageResult }).triage
        await queues.qa.add(
          'qa',
          {
            clusterId,
            write: result,
            priority: (triage?.suggestedPriority ?? 'normal') as Priority,
            attempt: 0,
          },
          { priority: 5 },
        )
      },
      { connection, concurrency: 1 },
    ),
  )

  workers.push(
    new Worker(
      'qa',
      async (job) =>
        processQaJob(job.data, {
          router,
          payload,
          writeQueue: queues.write,
          mediaQueue: queues.media,
          notifyReview,
        }),
      { connection, concurrency: 1 },
    ),
  )

  workers.push(
    new Worker(
      'media',
      async (job) => processMediaJob(job.data, { payload, env, publishQueue: queues.publish }),
      { connection, concurrency: 2 },
    ),
  )

  workers.push(
    new Worker(
      'publish',
      async (job) => {
        const d = job.data as {
          clusterId: string
          write: WriteResult
          heroMediaId?: string
          qaScore: number
          priority: Priority
        }
        const cluster = await payload.getCluster(d.clusterId)
        await processPublishJob(
          { ...d, triage: cluster.triage as TriageResult | undefined },
          { payload, socialQueue: queues.social },
        )
      },
      { connection, concurrency: 2 },
    ),
  )

  workers.push(
    new Worker(
      'social',
      async (job) => {
        const d = job.data as {
          articleId: string
          platform: 'facebook' | 'instagram' | 'x'
          copy: WriteResult['en']['socialCopy']
          mediaUrls: string[]
          priority: Priority
        }
        const settings = await payload.getSettings().catch(
          () => ({}) as import('./payload-client.js').PipelineSettings,
        )
        const cap = settings.dailyCaps?.[d.platform]
        if (d.platform === 'facebook') {
          await postFacebook(
            { articleId: d.articleId, copy: d.copy, mediaUrls: d.mediaUrls },
            { env, payload, bridge, settingsDailyCap: cap },
          )
        } else if (d.platform === 'instagram') {
          await postInstagram(
            { articleId: d.articleId, copy: d.copy, mediaUrls: d.mediaUrls },
            { env, payload, settingsDailyCap: cap },
          )
        } else {
          await postX(
            { articleId: d.articleId, copy: d.copy, priority: d.priority, mediaUrls: d.mediaUrls },
            { env, payload, bridge },
          )
        }
      },
      { connection, concurrency: 1 },
    ),
  )

  workers.push(
    new Worker(
      'data',
      async () => {
        const points = await fetchRatePoints(env)
        await postRatePoints(payload, points)
      },
      { connection, concurrency: 2 },
    ),
  )

  workers.push(
    new Worker(
      'metrics',
      async () => {
        logger.debug('metrics job stub — wire GSC/GA4/Meta insights')
      },
      { connection, concurrency: 1 },
    ),
  )

  for (const w of workers) {
    w.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'))
  }

  return {
    env,
    payload,
    router,
    bridge,
    telegram,
    queues,
    workers,
    paused: false,
  }
}

export async function scheduleIngestSources(runtime: WorkerRuntime): Promise<void> {
  try {
    const { sources } = await runtime.payload.getSources()
    for (const s of sources) {
      await runtime.queues.ingest.add(
        'poll',
        { sourceId: s.id, url: s.url, type: s.type, etag: s.etag, lang: s.language },
        {
          repeat: { every: Math.max(60, s.pollIntervalSec) * 1000 },
          jobId: `ingest-${s.id}`,
        } as Parameters<Queue['add']>[2],
      )
    }
  } catch (e) {
    logger.warn({ err: e }, 'Could not schedule ingest — Payload unavailable?')
  }

  await runtime.queues.data.add(
    'rates',
    {},
    { repeat: { every: 30 * 60 * 1000 }, jobId: 'data-rates' } as Parameters<Queue['add']>[2],
  )
  await runtime.queues.metrics.add(
    'daily',
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'metrics-daily' } as Parameters<Queue['add']>[2],
  )
}

export async function pauseAll(runtime: WorkerRuntime): Promise<void> {
  runtime.paused = true
  await Promise.all(Object.values(runtime.queues).map((q) => q.pause()))
}

export async function resumeAll(runtime: WorkerRuntime): Promise<void> {
  runtime.paused = false
  await Promise.all(Object.values(runtime.queues).map((q) => q.resume()))
}

export async function getQueueStats(runtime: WorkerRuntime): Promise<string> {
  const lines: string[] = []
  for (const name of QUEUE_NAMES) {
    const counts = await runtime.queues[name].getJobCounts('waiting', 'active', 'failed')
    lines.push(`${name}: w=${counts.waiting} a=${counts.active} f=${counts.failed}`)
  }
  const health = await runtime.router.health()
  lines.push(`ollama=${health.ollama} gemini=${health.gemini}`)
  return lines.join('\n')
}

export async function shutdownRuntime(runtime: WorkerRuntime): Promise<void> {
  await Promise.all(runtime.workers.map((w) => w.close()))
  await Promise.all(Object.values(runtime.queues).map((q) => q.close()))
}
