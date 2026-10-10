import { loadConfig, integrationStatus } from './config.js'
import { logger } from './logger.js'
import { BridgeServer } from './bridge/server.js'
import { createTelegramBot } from './telegram/bot.js'
import {
  createWorkerRuntime,
  scheduleIngestSources,
  shutdownRuntime,
  pauseAll,
  resumeAll,
  getQueueStats,
  type WorkerRuntime,
} from './queues.js'
import { startHeartbeat } from './heartbeat.js'

async function main() {
  const env = loadConfig()
  const integrations = integrationStatus(env)
  logger.info({ integrations }, 'Zaviya worker starting')

  const bridge = new BridgeServer(env.BRIDGE_PORT, env.BRIDGE_TOKEN)
  bridge.start()

  let runtime: WorkerRuntime | null = null

  const telegram = createTelegramBot(env, {
    payload: new (await import('./payload-client.js')).PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY),
    writeQueue: {
      add: async (...args: unknown[]) => {
        if (!runtime) return
        await runtime.queues.write.add(
          args[0] as string,
          args[1] as object,
          args[2] as Parameters<WorkerRuntime['queues']['write']['add']>[2],
        )
      },
    } as unknown as WorkerRuntime['queues']['write'],
    pauseAll: async () => {
      if (runtime) await pauseAll(runtime)
    },
    resumeAll: async () => {
      if (runtime) await resumeAll(runtime)
    },
    getStats: async () => (runtime ? getQueueStats(runtime) : 'starting…'),
  })

  runtime = await createWorkerRuntime(env, bridge, telegram)
  await scheduleIngestSources(runtime)
  const heartbeatTimer = startHeartbeat(runtime)

  if (telegram.bot) {
    telegram.bot.start({ onStart: () => logger.info('Telegram bot started') }).catch((e) => {
      logger.warn({ err: e }, 'Telegram bot failed to start')
    })
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down')
    clearInterval(heartbeatTimer)
    telegram.bot?.stop()
    bridge.stop()
    if (runtime) await shutdownRuntime(runtime)
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((e) => {
  logger.error({ err: e }, 'worker fatal')
  process.exit(1)
})
