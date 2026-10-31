import { DelayedError, Queue, Worker, type ConnectionOptions } from 'bullmq'
import { LLMRouter, isQuotaExhausted } from '@zaviya/llm'
import { embedder, fluxCreds, subscriptionChain, type WorkerEnv } from './config.js'
import { PayloadClient, type SourceItemInput } from './payload-client.js'
import { logger } from './logger.js'
import { processEmbedJob } from './pipeline/embed.js'
import { processTriageJob, releaseDeferredClusters, releaseStuckNewClusters } from './pipeline/triage.js'
import { processWriteJob } from './pipeline/write.js'
import { processQaJob } from './pipeline/qa.js'
import { processMediaJob } from './pipeline/media.js'
import { HERO_BACKFILL_JOB, processHeroBackfill } from './pipeline/hero-backfill.js'
import { processPublishJob } from './pipeline/publish.js'
import { EXPLAINER_QUEUE, processExplainerScript, processHeadlineJob } from './video/explainer/script-job.js'
import { startExplainerImageWorker } from './video/explainer/gemini-images.js'
import { fetchRssFeed, jobLikeDropped, toSourceItemInputs } from './ingest/rss.js'
import { BUILTIN_SOURCES, fetchPpscSourceItems, isPpscUrl } from './ingest/ppsc.js'
import { isAllowedByRobots } from './ingest/robots.js'
import { fetchArticleText } from './ingest/extract.js'
import { fetchCuratedTweets } from './ingest/x.js'
import { fetchTrends, isTrendsUrl, trendsToSourceItems } from './ingest/trends.js'
import { DEFAULT_X_QUERIES, runDiscovery, X_TRENDS_KEY } from './ingest/discovery.js'
import { runLearningJob } from './pipeline/learning.js'
import { Redis } from 'ioredis'
import { postFacebook } from './social/facebook.js'
import { postInstagram } from './social/instagram.js'
import { postX } from './social/x.js'
import { runSocialMetrics } from './social/metrics.js'
import { redisKv, runCommentReplies } from './social/comments.js'
import { redisKv as mailKv } from './mail/kv.js'
import { smtpMailer } from './mail/transport.js'
import { SITE_ORIGIN } from './social/link.js'
import { runNewsletter } from './newsletter/send.js'
import { findDuplicateStory } from './social/guards.js'
import { decideSlot, pktDayStart } from './social/caps.js'
import { fetchRatePoints, postRatePoints } from './data/rates.js'
import type { BridgeServer } from './bridge/server.js'
import type { TelegramAlerts } from './telegram/bot.js'
import { sendReviewCard } from './telegram/bot.js'
import type { Priority, TriageResult } from '@zaviya/shared'
import type { WriteResult } from './pipeline/write.js'

import { TRENDS_KEY } from './queues-keys.js'
import { releaseStuckApproved } from './pipeline/release-approved.js'
export { TRENDS_KEY }

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
  'discover',
] as const

export type QueueName = (typeof QUEUE_NAMES)[number]

/** Locks renew while a job runs; 3 min lets a restarted worker pick up interrupted jobs quickly. */
const LONG_LOCK_MS = 3 * 60_000

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
  redis: Redis
  paused: boolean
  pausedByKillSwitch?: boolean
}

export function createConnection(env: WorkerEnv): ConnectionOptions {
  return { url: env.REDIS_URL, maxRetriesPerRequest: null }
}

export function buildRouter(env: WorkerEnv): LLMRouter {
  return new LLMRouter({
    ollamaUrl: env.OLLAMA_URL,
    geminiApiKey: env.GEMINI_API_KEY,
    localModel: env.LOCAL_MODEL,
    apiBaseUrl: env.LLM_API_BASE_URL,
    apiKey: env.LLM_API_KEY,
    apiFallbackModel: env.LLM_API_FALLBACK_MODEL,
    apiLightModel: env.LLM_API_LIGHT_MODEL,
    subscriptionChain: subscriptionChain(env),
    embedder: embedder(env),
  })
}

export async function createWorkerRuntime(
  env: WorkerEnv,
  bridge: BridgeServer,
  telegram: TelegramAlerts,
): Promise<WorkerRuntime> {
  const connection = createConnection(env)
  const payload = new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY)
  const router = buildRouter(env)

  try {
    const settings = await payload.getSettings()
    router.updateSettings({ activeModels: settings.activeModels as Record<string, string> | undefined })
  } catch (e) {
    logger.warn({ err: e }, 'Could not load settings — using defaults')
  }

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })

  const queues = Object.fromEntries(
    QUEUE_NAMES.map((name) => [name, new Queue(name, { connection, defaultJobOptions: defaultJobOpts })]),
  ) as Record<QueueName, Queue>

  /** Save new items, pull full text for articles, and queue them for clustering. */
  const storeItems = async (inputs: SourceItemInput[]) => {
    for (const item of inputs) {
      if (item.contentText) continue
      if (await isAllowedByRobots(item.url).catch(() => false)) {
        const text = await fetchArticleText(item.url)
        if (text) item.contentText = text
      }
    }
    const res = await payload.postSourceItems(inputs)
    for (const ins of res.inserted) {
      const item = inputs.find((i) => i.externalId === ins.externalId)
      if (item) await queues.embed.add('embed', { sourceItemId: ins.id, title: item.title, summary: item.summary })
    }
    return res
  }

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
        let inputs: SourceItemInput[] = []
        let nextEtag: string | undefined
        if (isPpscUrl(url)) {
          // No feed: the official jobs page is read directly and every open advertisement becomes one item (ZAV-86)
          inputs = await fetchPpscSourceItems(sourceId, url)
        } else if (isTrendsUrl(url)) {
          const trends = await fetchTrends(url)
          await redis.set(TRENDS_KEY, JSON.stringify({ at: new Date().toISOString(), trends }))
          inputs = trendsToSourceItems(sourceId, trends)
        } else {
          const feed = await fetchRssFeed(url, { etag })
          nextEtag = feed.etag
          if (!feed.notModified) {
            inputs = toSourceItemInputs(sourceId, feed.items, lang)
            // Say so when job or vacancy items are left out for age, instead of dropping them silently (ZAV-86)
            const dropped = jobLikeDropped(feed.items, inputs)
            if (dropped.length) logger.info({ sourceId, count: dropped.length, titles: dropped.slice(0, 5) }, 'ingest: job items skipped, older than 48 h')
          }
        }
        if (inputs.length) await storeItems(inputs)
        await payload.patchSource(sourceId, {
          etag: nextEtag,
          lastPolledAt: new Date().toISOString(),
        })
      },
      { connection, concurrency: 4 },
    ),
  )

  workers.push(
    new Worker('embed', async (job) => processEmbedJob(job.data, { router, payload, triageQueue: queues.triage, embedQueue: queues.embed, minSources: env.TRIAGE_MIN_SOURCES }), {
      connection,
      concurrency: 2,
      // Stay under the free Gemini embedding rate limit when a feed delivers hundreds of items at once
      limiter: { max: env.CLOUDFLARE_AI_TOKEN ? 600 : 50, duration: 60_000 },
    }),
  )

  workers.push(
    new Worker(
      'triage',
      async (job) =>
        job.name === 'release-deferred'
          ? (async () => {
              await releaseDeferredClusters({ payload, triageQueue: queues.triage })
              await releaseStuckNewClusters({ payload, triageQueue: queues.triage, minSources: env.TRIAGE_MIN_SOURCES })
              // ZAV-107: approved clusters that never reached the writer
              await releaseStuckApproved({ payload, writeQueue: queues.write, chain: [queues.write, queues.qa, queues.media, queues.publish] })
            })()
          : processTriageJob(job.data, {
              router,
              payload,
              writeQueue: queues.write,
              triageQueue: queues.triage,
              notifyReview,
              bridge,
              autoApprove: env.AUTO_APPROVE,
              pitch: env.EDITOR_GATE && env.EDITOR_PITCH,
            }),
      // The local model handles one job at a time; an API model can triage several clusters at once.
      { connection, concurrency: env.LOCAL_MODEL === 'off' ? 4 : 1, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
    ),
  )

  workers.push(
    new Worker(
      'write',
      async (job) => {
        const { clusterId, attempt, feedback, priority } = job.data as {
          clusterId: string
          attempt?: number
          feedback?: string[]
          priority?: Priority
        }
        if (job.name === 'write-retry' && attempt !== undefined) {
          logger.info({ clusterId, attempt }, 'write retry from QA')
        }
        let result: WriteResult | null
        try {
          result = await processWriteJob({ clusterId, feedback }, { router, payload, env, redis, bridge })
        } catch (e) {
          // Every model (cloud and local) unavailable: try again when the quota resets.
          if (isQuotaExhausted(e)) {
            await queues.write.add(job.name, job.data, { delay: Math.max(60_000, e.resetAt - Date.now()), priority: 4 })
            logger.warn({ clusterId, retryAt: new Date(e.resetAt).toISOString() }, 'write deferred: no model available')
            return
          }
          throw e
        }
        if (!result) return
        const triage = (job.data as { triage?: TriageResult }).triage
        await queues.qa.add(
          'qa',
          {
            clusterId,
            write: result,
            priority: priority ?? ((triage?.suggestedPriority ?? 'normal') as Priority),
            attempt: attempt ?? 0,
          },
          { priority: 5 },
        )
      },
      { connection, concurrency: 1, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
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
          autoApprove: env.AUTO_APPROVE,
        }),
      { connection, concurrency: 1, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
    ),
  )

  workers.push(
    new Worker(
      'media',
      async (job) =>
        job.name === HERO_BACKFILL_JOB
          ? processHeroBackfill(job.data, { payload, env, mediaQueue: queues.media, bridge })
          : processMediaJob(job.data, { payload, env, publishQueue: queues.publish, mediaQueue: queues.media, bridge }),
      { connection, concurrency: 2, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
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
          socialMediaUrls?: string[]
          qaScore: number
          priority: Priority
        }
        const cluster = await payload.getCluster(d.clusterId)
        await processPublishJob(
          { ...d, triage: cluster.triage as TriageResult | undefined },
          { payload, socialQueue: queues.social, publishQueue: queues.publish, gate: env.EDITOR_GATE ? { redis } : undefined, redis },
        )
      },
      { connection, concurrency: 2, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
    ),
  )

  // Explainer pictures: Gemini (through the extension) or FLUX, claimed from the video service's media hub
  if (env.MEDIA_AGENT_TOKEN) {
    startExplainerImageWorker({
      hubUrl: env.VIDEO_HUB_URL,
      token: env.MEDIA_AGENT_TOKEN,
      deps: { bridge, geminiAccount: env.GEMINI_WEB_ACCOUNT, accountId: fluxCreds(env).accountId, aiToken: fluxCreds(env).token },
    })
  }

  // Explainer videos: the video service has no LLM, so the script is written here and left in Redis
  workers.push(
    new Worker(EXPLAINER_QUEUE, async (job) => (job.name === 'headlines' ? processHeadlineJob(job.data, { router, redis }) : processExplainerScript(job.data, { router, redis })), {
      connection,
      concurrency: 1,
      lockDuration: LONG_LOCK_MS,
      stalledInterval: LONG_LOCK_MS,
    }),
  )

  workers.push(
    new Worker(
      'social',
      async (job, token) => {
        const d = job.data as {
          articleId: string
          platform: 'facebook' | 'instagram' | 'x'
          copy: WriteResult['en']['socialCopy']
          mediaUrls: string[]
          priority: Priority
          url?: string
          title?: string
          clusterId?: string
        }
        // One story, one post per platform (ZAV-120): a sister article about the same event in the last 6h is skipped
        if (d.title) {
          const recent = await payload.getRecentSocialPosts(d.platform, 6)
          const dup = findDuplicateStory({ articleId: String(d.articleId), clusterId: d.clusterId, title: d.title }, recent.posts)
          if (dup) {
            logger.info({ articleId: d.articleId, platform: d.platform, duplicateOf: dup.articleId }, 'social post skipped: same story already posted')
            return { skipped: `duplicate of article ${dup.articleId}` }
          }
        }
        const settings = await payload.getSettings().catch(
          () => ({}) as import('./payload-client.js').PipelineSettings,
        )
        const cap = settings.dailyCaps?.[d.platform]
        // ZAV-115: daily cap, peak hours and spacing. If the count cannot be read, wait and retry rather than post blind.
        const now = Date.now()
        const sent = await payload.getSocialCount(pktDayStart(now))
        const slot = decideSlot({
          platform: d.platform,
          priority: d.priority,
          now,
          queuedAt: job.timestamp,
          settingsCaps: settings.dailyCaps,
          postedToday: sent.counts[d.platform] ?? 0,
          lastPostedAt: sent.lastPostedAt[d.platform],
        })
        if (slot.action === 'skip') {
          logger.info({ articleId: d.articleId, platform: d.platform, reason: slot.reason }, 'social post skipped')
          return { skipped: slot.reason }
        }
        if (slot.action === 'delay') {
          await job.moveToDelayed(slot.until + Math.floor(Math.random() * 60_000), token)
          throw new DelayedError()
        }
        if (d.platform === 'facebook') {
          await postFacebook(
            { articleId: d.articleId, copy: d.copy, mediaUrls: d.mediaUrls, url: d.url },
            { env, payload, bridge, settingsDailyCap: cap },
          )
        } else if (d.platform === 'instagram') {
          await postInstagram(
            { articleId: d.articleId, copy: d.copy, mediaUrls: d.mediaUrls, url: d.url },
            { env, payload, settingsDailyCap: cap },
          )
        } else {
          await postX(
            { articleId: d.articleId, copy: d.copy, priority: d.priority, mediaUrls: d.mediaUrls, url: d.url },
            { env, payload, bridge },
          )
        }
      },
      { connection, concurrency: 1, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
    ),
  )

  workers.push(
    new Worker(
      'data',
      async (job) => {
        if (job.name === 'newsletter') {
          const mailer = smtpMailer({ host: env.MAIL_HOST, user: env.NEWS_MAIL_USER, password: env.NEWS_MAIL_PASSWORD! })
          return runNewsletter({ request: (m, p, b) => payload.request(m, p, b), mailer, kv: mailKv(redis), site: SITE_ORIGIN })
        }
        const rates = await fetchRatePoints(env, redis)
        await postRatePoints(payload, rates)
        return { points: rates.points.length, tables: rates.snapshots.map((x) => x.key) }
      },
      { connection, concurrency: 2, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
    ),
  )

  workers.push(
    new Worker(
      'discover',
      async () => {
        if (!bridge.isOnline()) return { skipped: 'extension offline' }
        const { sources } = await payload.getSources()
        const xSource = sources.find((s) => s.key === 'x-discovery')
        const igSource = sources.find((s) => s.key === 'instagram-discovery')
        const list = (v?: string, sep = ',') => v?.split(sep).map((x) => x.trim()).filter(Boolean)
        // The editor agent's sourcing plan (Payload) wins over env and the built-in defaults;
        // its active "hunts" are searched on X on top of the regular queries.
        const plan = (await payload.getSettings().catch(() => null))?.sourcingPlan
        const hunts = (plan?.hunts ?? []).filter((h) => Date.parse(h.until) > Date.now()).map((h) => h.query)
        const baseX = plan?.xQueries?.length ? plan.xQueries : list(env.DISCOVERY_X_QUERIES, '||')
        const result = await runDiscovery({
          bridge,
          xSourceId: xSource?.id,
          igSourceId: igSource?.id,
          xQueries: hunts.length ? [...hunts, ...(baseX ?? DEFAULT_X_QUERIES)].slice(0, 14) : baseX,
          igProfiles: plan?.igProfiles?.length ? plan.igProfiles : list(env.DISCOVERY_IG_PROFILES),
        })
        if (result.xTrends.length) {
          await redis.set(X_TRENDS_KEY, JSON.stringify({ at: new Date().toISOString(), trends: result.xTrends }))
        }
        if (result.items.length) await storeItems(result.items)
        if (result.errors.some((e) => /checkpoint/.test(e))) {
          await telegram.notify('⚠️ Extension hit a security checkpoint during discovery. Paused until next round.')
        }
        return { items: result.items.length, trends: result.xTrends.length, errors: result.errors.length }
      },
      { connection, concurrency: 1, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
    ),
  )

  workers.push(
    new Worker(
      'metrics',
      async (job) =>
        job.name === 'social-metrics'
          ? runSocialMetrics({ env, payload })
          : job.name === 'comment-replies'
            ? runCommentReplies({ env, payload, kv: redisKv(redis) })
            : runLearningJob({ payload, router, telegram }),
      { connection, concurrency: 1, lockDuration: LONG_LOCK_MS, stalledInterval: LONG_LOCK_MS },
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
    redis,
    paused: false,
  }
}

export async function scheduleIngestSources(runtime: WorkerRuntime): Promise<void> {
  try {
    // Sources the code itself depends on (no feed to subscribe to) are created once if they are missing
    for (const b of BUILTIN_SOURCES) {
      await runtime.payload.ensureSource(b).then(
        (r) => r.created && logger.info({ key: b.key }, 'built-in source created'),
        (e) => logger.warn({ err: e instanceof Error ? e.message : e, key: b.key }, 'could not ensure built-in source'),
      )
    }
    const { sources } = await runtime.payload.getSources()
    const wanted = new Set(sources.map((s) => `ingest-${s.id}`))
    // Drop schedulers for sources that were disabled or deleted since the last start.
    for (const sched of await runtime.queues.ingest.getJobSchedulers()) {
      if (sched.key && !wanted.has(sched.key)) await runtime.queues.ingest.removeJobScheduler(sched.key)
    }
    for (const s of sources) {
      const data = { sourceId: s.id, url: s.url, type: s.type, etag: s.etag, lang: s.language }
      await runtime.queues.ingest.upsertJobScheduler(
        `ingest-${s.id}`,
        { every: Math.max(60, s.pollIntervalSec) * 1000 },
        { name: 'poll', data },
      )
      // Schedulers wait one full interval before their first run; poll once now too.
      await runtime.queues.ingest.add('poll', data, { jobId: `ingest-now-${s.id}-${Date.now()}` })
    }
  } catch (e) {
    logger.warn({ err: e }, 'Could not schedule ingest — Payload unavailable?')
  }

  // ZAV-144: put deferred clusters whose retry job was lost back on the triage queue
  await runtime.queues.triage.upsertJobScheduler('release-deferred', { every: 5 * 60 * 1000 }, { name: 'release-deferred', data: {} })
  await runtime.queues.data.upsertJobScheduler('data-rates', { every: 30 * 60 * 1000 }, { name: 'rates', data: {} })
  await runtime.queues.discover.upsertJobScheduler(
    'discover-social',
    { every: runtime.env.DISCOVERY_INTERVAL_MIN * 60 * 1000 },
    { name: 'discover', data: {} },
  )
  await runtime.queues.discover.add('discover', {}, { delay: 60_000 })
  await runtime.queues.data.add('rates', {})
  // ZAV-109 phase 2: confirmation mails and the 07:30 PKT briefing. Scheduled only with NEWSLETTER_SEND=true and the news@ password set.
  if (runtime.env.NEWSLETTER_SEND && runtime.env.NEWS_MAIL_PASSWORD) {
    await runtime.queues.data.upsertJobScheduler('newsletter', { every: 10 * 60 * 1000 }, { name: 'newsletter', data: {} })
    logger.info('newsletter sending is ON (every 10 min; briefing 07:30-11:30 PKT)')
  } else {
    await runtime.queues.data.removeJobScheduler('newsletter').catch(() => {})
  }
  await runtime.queues.metrics.upsertJobScheduler(
    'metrics-daily',
    { every: 24 * 60 * 60 * 1000 },
    { name: 'daily', data: {} },
  )
  // ZAV-108: 1 h / 24 h post metrics and the daily follower counts
  await runtime.queues.metrics.upsertJobScheduler('social-metrics', { every: 30 * 60 * 1000 }, { name: 'social-metrics', data: {} })
  // ZAV-111 / ZAV-132: friendly replies to comments on our own FB and IG posts (kill switch: COMMENT_REPLIES=0)
  await runtime.queues.metrics.upsertJobScheduler('comment-replies', { every: 30 * 60 * 1000 }, { name: 'comment-replies', data: {} })
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
  runtime.redis.disconnect()
}
