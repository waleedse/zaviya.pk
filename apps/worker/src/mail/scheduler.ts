import { Queue, Worker } from 'bullmq'
import { type WorkerEnv } from '../config.js'
import { logger } from '../logger.js'
import { getQueueStats, pauseAll, resumeAll, createConnection, type WorkerRuntime } from '../queues.js'
import { parseSlots } from '../video/schedule.js'
import { WALEED } from './auth.js'
import { linearClient } from './linear.js'
import { redisKv, type Kv } from './kv.js'
import { processMailbox, type ProcessorDeps } from './processor.js'
import { openMailbox, smtpMailer } from './transport.js'

export const MAIL_QUEUE = 'mail-commands'
export const MAIL_EVERY_MS = 3 * 60_000

export function allowedSenders(env: Pick<WorkerEnv, 'MAIL_COMMANDS_ALLOW_FROM'>): string[] {
  const extra = (env.MAIL_COMMANDS_ALLOW_FROM ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  return [WALEED, ...extra]
}

export function mailCommandsEnabled(env: WorkerEnv): boolean {
  return env.MAIL_COMMANDS_ENABLED && Boolean(env.OPS_MAIL_USER && env.OPS_MAIL_PASSWORD)
}

/** Everything the processor needs, from the running worker (shared by the scheduler and the CLI) */
export function buildDeps(
  env: WorkerEnv,
  parts: {
    kv: Kv
    payload: WorkerRuntime['payload']
    router: WorkerRuntime['router']
    videoQueue: Pick<Queue, 'add'>
    controls: ProcessorDeps['exec']['controls']
    notifyAdmin: (t: string) => Promise<void>
    box: ProcessorDeps['box']
    dry?: boolean
  },
): ProcessorDeps {
  const account = { host: env.MAIL_HOST, user: env.OPS_MAIL_USER!, password: env.OPS_MAIL_PASSWORD! }
  return {
    box: parts.box,
    mailer: smtpMailer(account),
    kv: parts.kv,
    auth: { host: env.MAIL_HOST, allowed: allowedSenders(env) },
    router: parts.router,
    notifyAdmin: parts.notifyAdmin,
    log: (line, msg) => logger.info({ mailcmd: line }, msg),
    dry: parts.dry,
    exec: {
      payload: parts.payload,
      kv: parts.kv,
      slots: parseSlots(env.VIDEO_SLOTS),
      controls: parts.controls,
      videoQueue: parts.videoQueue,
      linear: env.LINEAR_API_KEY ? linearClient(env.LINEAR_API_KEY, env.LINEAR_TEAM_KEY) : null,
      answerer: async (question, status) => {
        const r = await parts.router.chat('triage', {
          messages: [
            { role: 'system', content: 'Answer Waleed\'s question using ONLY the status data. Plain text, at most 4 short lines. If the data does not contain the answer, say so.' },
            { role: 'user', content: `Status data:\n${status}\n\nQuestion: ${question}` },
          ],
          temperature: 0,
          timeoutMs: 60_000,
        })
        return r.content.trim() || null
      },
      now: () => Date.now(),
      dry: parts.dry,
    },
  }
}

/** Starts the 3-minute poll. Returns a stop function. Does nothing unless MAIL_COMMANDS_ENABLED=true and the ops@ login is set. */
export async function startMailCommands(runtime: WorkerRuntime): Promise<(() => Promise<void>) | null> {
  const env = runtime.env
  if (!mailCommandsEnabled(env)) {
    if (env.MAIL_COMMANDS_ENABLED) logger.warn('MAIL_COMMANDS_ENABLED is true but OPS_MAIL_USER / OPS_MAIL_PASSWORD are not set: mail commands stay off')
    return null
  }
  const connection = createConnection(env)
  const queue = new Queue(MAIL_QUEUE, { connection, defaultJobOptions: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 } } })
  const videoQueue = new Queue('video', { connection })
  await queue.upsertJobScheduler(MAIL_QUEUE, { every: MAIL_EVERY_MS }, { name: 'poll' })

  const worker = new Worker(
    MAIL_QUEUE,
    async () => {
      const box = await openMailbox({ host: env.MAIL_HOST, user: env.OPS_MAIL_USER!, password: env.OPS_MAIL_PASSWORD! })
      try {
        const deps = buildDeps(env, {
          kv: redisKv(runtime.redis),
          payload: runtime.payload,
          router: runtime.router,
          videoQueue,
          controls: {
            pause: () => pauseAll(runtime),
            resume: () => resumeAll(runtime),
            isPaused: () => runtime.paused,
            queueStats: () => getQueueStats(runtime),
          },
          notifyAdmin: runtime.telegram.notify,
          box,
        })
        const sum = await processMailbox(deps)
        if (sum.seen) logger.info({ mailcmd: sum }, 'mail commands run')
        return sum
      } finally {
        await box.close().catch(() => {})
      }
    },
    { connection, concurrency: 1, lockDuration: 5 * 60_000 },
  )
  worker.on('failed', (_job, err) => logger.warn({ err: err.message }, 'mail commands run failed'))
  logger.info({ every: '3 min', user: env.OPS_MAIL_USER, allowFrom: allowedSenders(env) }, 'mail commands on')

  return async () => {
    await worker.close().catch(() => {})
    await queue.close().catch(() => {})
    await videoQueue.close().catch(() => {})
  }
}
