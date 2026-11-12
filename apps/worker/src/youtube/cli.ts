/**
 *   node --import tsx src/youtube/cli.ts backfill [--dry]   queue every posted video still on disk (explainers first, oldest first)
 *   node --import tsx src/youtube/cli.ts status             counts, and the uploaded and skipped lists
 *
 * Runs inside the video service container (it has the videos on disk and the same Redis as the uploader).
 */
import { parseArgs } from 'node:util'
import { Redis } from 'ioredis'
import { loadConfig } from '../config.js'
import { loadVideoConfig } from '../video/config.js'
import { backfill } from './producer.js'
import { YtStore, type YtRedis } from './queue.js'

const { positionals, values } = parseArgs({ allowPositionals: true, options: { dry: { type: 'boolean' } } })
const env = loadConfig()
const cfg = loadVideoConfig()
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
const store = new YtStore(redis as unknown as YtRedis)
try {
  if (positionals[0] === 'backfill') {
    const report = await backfill(store, cfg.dataDir, {
      siteUrl: cfg.siteUrl,
      dryRun: values.dry,
      posted: async (key) => (await redis.get(`video:done:${key}`)) === 'posted' || (await redis.get(`explainer:done:${key}`)) === 'posted',
    })
    console.log(JSON.stringify({ dryRun: !!values.dry, ...report }, null, 2))
  } else if (positionals[0] === 'status') {
    console.log(JSON.stringify({ ...(await store.report()), state: await store.state(), uploaded: await store.doneRecords() }, null, 2))
  } else {
    console.error('usage: cli.ts backfill [--dry] | status')
    process.exitCode = 2
  }
} finally {
  redis.disconnect()
}
