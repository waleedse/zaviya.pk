/**
 * Separate process for the daily videos. It owns exactly one queue ("video") and sends to Telegram over plain HTTP:
 * no bridge, no grammy, no other queues. VIDEO_ENABLED must be "true" or it just idles.
 */
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { loadConfig } from '../config.js'
import { logger } from '../logger.js'
import { loadVideoConfig } from './config.js'
import { createJobDeps } from './deps.js'
import { runEdition } from './job.js'
import { repeatFor, schedulerId, staleSchedulers } from './schedule.js'

export const VIDEO_QUEUE = 'video'

async function main() {
  const env = loadConfig()
  const cfg = loadVideoConfig()
  if (!cfg.enabled) {
    logger.info('video service: VIDEO_ENABLED is not "true", idling (nothing is scheduled or posted)')
    setInterval(() => {}, 1 << 30)
    process.on('SIGTERM', () => process.exit(0))
    process.on('SIGINT', () => process.exit(0))
    return
  }

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
  const queue = new Queue(VIDEO_QUEUE, {
    connection: redis,
    defaultJobOptions: { attempts: 1, removeOnComplete: { count: 30 }, removeOnFail: { count: 30 } },
  })

  for (const slot of cfg.slots) {
    await queue.upsertJobScheduler(schedulerId(slot), repeatFor(slot), { name: 'run', data: { slot: slot.name } })
  }
  const existing = await queue.getJobSchedulers()
  for (const id of staleSchedulers(existing.map((s) => s.key ?? s.id ?? ''), cfg.slots)) {
    await queue.removeJobScheduler(id)
    logger.info({ id }, 'removed stale video scheduler')
  }
  logger.info({ slots: cfg.slots.map((s) => `${s.name}@${s.hour}:${s.minute}=${s.format}`), platforms: cfg.platforms, vetoMin: cfg.vetoMin }, cfg.platforms.length ? 'video service started' : 'video service started (dry run: VIDEO_PLATFORMS is empty)')

  const deps = createJobDeps(env, cfg, redis)
  const worker = new Worker(
    VIDEO_QUEUE,
    async (job) => {
      const slot = cfg.slots.find((s) => s.name === (job.data as { slot?: string }).slot)
      if (!slot) throw new Error(`unknown slot ${JSON.stringify(job.data)}`)
      const outcome = await runEdition(deps, slot)
      logger.info({ outcome }, 'video job finished')
      return outcome
    },
    { connection: redis.duplicate({ maxRetriesPerRequest: null }), concurrency: 1, lockDuration: 15 * 60_000, stalledInterval: 15 * 60_000 },
  )
  worker.on('failed', (job, err) => logger.error({ id: job?.id, err: err.message }, 'video job failed'))

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'video service shutting down')
    await worker.close().catch(() => {})
    await queue.close().catch(() => {})
    redis.disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((e) => {
  logger.error({ err: e }, 'video service fatal')
  process.exit(1)
})
