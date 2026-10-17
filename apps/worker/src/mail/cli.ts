/**
 * Try the mail commands by hand:
 *   node --env-file=<env> --import tsx src/mail/cli.ts once --dry [--no-model]
 * `once` runs one pass over ops@'s unread mail. With --dry nothing is marked read or remembered, and actions that
 * change something only say what they would do (status and answers still read live data). Needs
 * OPS_MAIL_USER / OPS_MAIL_PASSWORD in the environment (never as arguments); MAIL_COMMANDS_ENABLED must be true.
 */
import { Redis } from 'ioredis'
import { loadConfig } from '../config.js'
import { PayloadClient } from '../payload-client.js'
import { buildRouter } from '../queues.js'
import { buildDeps, mailCommandsEnabled } from './scheduler.js'
import { memoryKv, redisKv } from './kv.js'
import { processMailbox } from './processor.js'
import { openMailbox } from './transport.js'

async function main() {
  const [cmd, ...flags] = process.argv.slice(2)
  if (cmd !== 'once') {
    console.error('usage: cli.ts once [--dry] [--no-model] [--redis]')
    process.exit(2)
  }
  const dry = flags.includes('--dry')
  const env = loadConfig()
  if (!mailCommandsEnabled(env)) {
    console.error('Mail commands are off: set MAIL_COMMANDS_ENABLED=true, OPS_MAIL_USER and OPS_MAIL_PASSWORD.')
    process.exit(1)
  }
  const redis = flags.includes('--redis') ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }) : null
  const router = buildRouter(env)
  const modelDown = flags.includes('--no-model')
  const box = await openMailbox({ host: env.MAIL_HOST, user: env.OPS_MAIL_USER!, password: env.OPS_MAIL_PASSWORD! })
  try {
    const deps = buildDeps(env, {
      kv: redis ? redisKv(redis) : memoryKv(),
      payload: new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY),
      router: modelDown ? ({ chat: async () => { throw new Error('model disabled by --no-model') } } as unknown as typeof router) : router,
      videoQueue: { add: async (name: string, data: object) => { console.log('[video queue]', name, JSON.stringify(data)); return undefined as never } },
      controls: {
        pause: async () => console.log('[pause]'),
        resume: async () => console.log('[resume]'),
        isPaused: () => false,
        queueStats: async () => 'queue stats are only available inside the running worker',
      },
      notifyAdmin: async (t) => console.log('[telegram notify]', t),
      box,
      dry,
    })
    deps.log = (line, msg) => console.log(msg, JSON.stringify(line))
    const sum = await processMailbox(deps)
    console.log('summary', JSON.stringify(sum))
  } finally {
    await box.close().catch(() => {})
    redis?.disconnect()
  }
}

main().catch((e) => {
  console.error('mail cli:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
