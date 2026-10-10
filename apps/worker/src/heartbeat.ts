import type { WorkerRuntime } from './queues.js'
import { QUEUE_NAMES } from './queues.js'
import { logger } from './logger.js'
import { pauseAll } from './queues.js'

export function startHeartbeat(runtime: WorkerRuntime): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      const queues: Record<string, { waiting: number; active: number; failed: number }> = {}
      for (const name of QUEUE_NAMES) {
        const c = await runtime.queues[name].getJobCounts('waiting', 'active', 'failed')
        queues[name] = { waiting: c.waiting ?? 0, active: c.active ?? 0, failed: c.failed ?? 0 }
      }
      const res = await runtime.payload.heartbeat({ version: runtime.env.WORKER_VERSION, queues })
      if (res.killSwitch) {
        logger.warn('killSwitch=true — pausing queues')
        await pauseAll(runtime)
      }
    } catch (e) {
      logger.warn({ err: e }, 'heartbeat failed')
    }
  }, 60_000)
}
