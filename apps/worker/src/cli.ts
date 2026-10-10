import { loadConfig } from './config.js'
import { PayloadClient } from './payload-client.js'
import { LLMRouter } from '@zaviya/llm'
import { createWorkerRuntime, shutdownRuntime } from './queues.js'
import { BridgeServer } from './bridge/server.js'
import { createTelegramBot } from './telegram/bot.js'
import { processTriageJob } from './pipeline/triage.js'
import { processWriteJob } from './pipeline/write.js'
import { TriageResultSchema } from '@zaviya/shared'
import { zodToJsonSchema } from '@zaviya/llm'
import { triageSystemPrompt, triageUserPrompt } from './prompts/triage.js'
import { logger } from './logger.js'

const cmd = process.argv[2]

async function run() {
  const env = loadConfig()
  const payload = new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY)
  const router = new LLMRouter({ ollamaUrl: env.OLLAMA_URL, geminiApiKey: env.GEMINI_API_KEY })

  if (cmd === 'ingest-once') {
    const sourceId = process.argv[3]
    const bridge = new BridgeServer(env.BRIDGE_PORT, env.BRIDGE_TOKEN)
    const telegram = createTelegramBot(env, {
      payload,
      writeQueue: { add: async () => undefined } as never,
      pauseAll: async () => {},
      resumeAll: async () => {},
      getStats: async () => '',
    })
    const runtime = await createWorkerRuntime(env, bridge, telegram)
    if (sourceId) {
      const { sources } = await payload.getSources()
      const s = sources.find((x) => String(x.id) === String(sourceId))
      if (!s) throw new Error('source not found')
      await runtime.queues.ingest.add('poll', {
        sourceId: s.id,
        url: s.url,
        type: s.type,
        etag: s.etag,
      })
    } else {
      const { sources } = await payload.getSources()
      for (const s of sources) {
        await runtime.queues.ingest.add('poll', {
          sourceId: s.id,
          url: s.url,
          type: s.type,
          etag: s.etag,
        })
      }
    }
    await new Promise((r) => setTimeout(r, 5000))
    await shutdownRuntime(runtime)
    return
  }

  if (cmd === 'triage') {
    const clusterId = process.argv[3]
    if (!clusterId) throw new Error('usage: triage <clusterId>')
    const bridge = new BridgeServer(env.BRIDGE_PORT, env.BRIDGE_TOKEN)
    const telegram = createTelegramBot(env, {
      payload,
      writeQueue: { add: async () => undefined } as never,
      pauseAll: async () => {},
      resumeAll: async () => {},
      getStats: async () => '',
    })
    const runtime = await createWorkerRuntime(env, bridge, telegram)
    await processTriageJob({ clusterId }, { router, payload, writeQueue: runtime.queues.write })
    await shutdownRuntime(runtime)
    return
  }

  if (cmd === 'write') {
    const clusterId = process.argv[3]
    if (!clusterId) throw new Error('usage: write <clusterId>')
    const res = await processWriteJob({ clusterId }, { router, payload, env })
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (cmd === 'bench') {
    const fixturePath = process.argv[3]
    let clusterIds: string[] = []
    if (fixturePath?.endsWith('.json')) {
      const fs = await import('node:fs/promises')
      const raw = JSON.parse(await fs.readFile(fixturePath, 'utf8')) as { clusterIds?: string[] }
      clusterIds = raw.clusterIds ?? []
    } else if (fixturePath) {
      clusterIds = [fixturePath]
    }
    const format = zodToJsonSchema(TriageResultSchema, { target: 'openApi3' }) as Record<string, unknown>
    let ok = 0
    let total = 0
    const t0 = Date.now()
    for (const id of clusterIds) {
      total++
      const cluster = await payload.getCluster(id)
      const start = Date.now()
      try {
        const triageRes = await router.chat('triage', {
          messages: [
            { role: 'system', content: triageSystemPrompt() },
            { role: 'user', content: triageUserPrompt(cluster) },
          ],
          format,
          timeoutMs: 180_000,
        })
        TriageResultSchema.parse(JSON.parse(triageRes.content))
        ok++
      } catch {
        /* count fail */
      }
      logger.info({ clusterId: id, ms: Date.now() - start }, 'bench triage')
      try {
        await processWriteJob({ clusterId: id }, { router, payload, env })
        ok++
      } catch {
        /* */
      }
      total++
    }
    const elapsed = (Date.now() - t0) / 1000
    console.log(
      JSON.stringify(
        {
          clusters: clusterIds.length,
          jsonValidityRate: total ? ok / total : 0,
          elapsedSec: elapsed,
          tokensPerSec: 'n/a (usage not aggregated)',
        },
        null,
        2,
      ),
    )
    return
  }

  console.log('Commands: ingest-once [sourceId], triage <clusterId>, write <clusterId>, bench [fixture.json|clusterId]')
}

run().catch((e) => {
  logger.error(e)
  process.exit(1)
})
