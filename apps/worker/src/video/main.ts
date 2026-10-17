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
import { flashKeys, flashSlot, pickFlash } from './flash.js'
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
  // Breaking flash: a check every 10 minutes (its id has no "video-" prefix, so the stale cleanup leaves it alone)
  if (cfg.flash) await queue.upsertJobScheduler('flash-check', { every: 10 * 60_000 }, { name: 'flash-check', data: {} })
  else await queue.removeJobScheduler('flash-check').catch(() => {})
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
      if (job.name === 'flash-check') {
        const now = Date.now()
        const k = flashKeys(now)
        const [done, count, last] = await Promise.all([redis.smembers(k.done), redis.get(k.count), redis.get(k.last)])
        const pick = pickFlash(
          await deps.fetchArticles(1),
          { done: new Set(done.map(Number)), countToday: Number(count ?? 0), lastAt: Number(last ?? 0) },
          cfg.slots,
          now,
        )
        if ('skip' in pick) return { flash: 'none', reason: pick.skip }
        // Claim first so a slow render can never be picked twice by the next check
        await redis.sadd(k.done, String(pick.id))
        await redis.expire(k.done, 7 * 86400)
        const outcome = await runEdition(deps, flashSlot(pick.id, now), { articleId: pick.id, vetoMin: 5 })
        if (outcome.status === 'posted') {
          await redis.incr(k.count)
          await redis.expire(k.count, 2 * 86400)
          await redis.set(k.last, String(Date.now()), 'EX', 86400)
        }
        logger.info({ outcome }, 'breaking flash finished')
        return outcome
      }
      const data = job.data as { slot?: string; now?: boolean }
      const slot = cfg.slots.find((s) => s.name === data.slot)
      if (!slot) throw new Error(`unknown slot ${JSON.stringify(job.data)}`)
      // `now` (email command "video now"): post without the veto wait; the Skip button / skip key still applies
      const outcome = await runEdition(deps, slot, data.now === true ? { now: true } : {})
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
