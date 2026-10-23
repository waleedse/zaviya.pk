/**
 *   node --import tsx src/video/cli.ts run <slot> [--now] [--dry] [--force]
 * Runs one edition immediately. --now posts with no wait, --dry renders and previews but never posts.
 * The same VIDEO_* env as the service applies (VIDEO_PLATFORMS= empty means dry run).
 */
import { parseArgs } from 'node:util'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { loadConfig } from '../config.js'
import { loadVideoConfig } from './config.js'
import { createJobDeps } from './deps.js'
import { EXPLAINER_QUEUE } from './explainer/script-job.js'
import { runEdition } from './job.js'
import { MediaHub, redisHubStore } from './media-hub.js'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { now: { type: 'boolean' }, dry: { type: 'boolean' }, force: { type: 'boolean' } },
})
const [cmd, slotName] = positionals
if (cmd !== 'run' || !slotName) {
  console.error('usage: cli.ts run <slot> [--now] [--dry] [--force]')
  process.exit(2)
}

const env = loadConfig()
const cfg = loadVideoConfig()
const slot = cfg.slots.find((s) => s.name === slotName)
if (!slot) {
  console.error(`unknown slot "${slotName}" (configured: ${cfg.slots.map((s) => s.name).join(', ')})`)
  process.exit(2)
}
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
// the same hub queue and script queue as the service, so a manual run can use the Mac's voice (VIDEO_VOICED=true)
const hub = new MediaHub(redisHubStore(redis as never), cfg.dataDir)
const scriptQueue = new Queue(EXPLAINER_QUEUE, { connection: redis })
try {
  const outcome = await runEdition(createJobDeps(env, cfg, redis, hub, scriptQueue), slot, { now: values.now, dry: values.dry, force: values.force })
  console.log(JSON.stringify(outcome, null, 2))
  process.exitCode = outcome.status === 'failed' ? 1 : 0
} finally {
  await scriptQueue.close().catch(() => {})
  redis.disconnect()
}
