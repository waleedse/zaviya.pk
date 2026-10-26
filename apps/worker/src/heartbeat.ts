import type { WorkerRuntime } from './queues.js'
import { QUEUE_NAMES, TRENDS_KEY, pauseAll, resumeAll } from './queues.js'
import { X_TRENDS_KEY } from './ingest/discovery.js'
import type { WorkerCommand } from './payload-client.js'
import { geminiModelStatus } from '@zaviya/llm'
import { logger } from './logger.js'
import { finishGated, gateFallback } from './pipeline/publish.js'
import { decidePitch, pitchFallback } from './pipeline/pitch.js'

async function readJson<T>(runtime: WorkerRuntime, key: string): Promise<T | null> {
  try {
    const raw = await runtime.redis.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function handleCommand(runtime: WorkerRuntime, cmd: WorkerCommand): Promise<void> {
  const clusterId = cmd.payload?.clusterId
  switch (cmd.kind) {
    case 'write':
      if (clusterId) {
        await runtime.payload.patchCluster(clusterId, { status: 'writing' })
        await runtime.queues.write.add('write', { clusterId }, { priority: 2 })
      }
      break
    case 'triage':
      if (clusterId) await runtime.queues.triage.add('triage', { clusterId }, { priority: 2 })
      break
    case 'pause':
      await pauseAll(runtime)
      break
    case 'resume':
      await resumeAll(runtime)
      break
    case 'discover':
      await runtime.queues.discover.add('discover', {})
      break
    case 'gate': {
      const articleId = String(cmd.payload?.articleId ?? '')
      const action = cmd.payload?.action === 'reject' ? 'reject' : 'publish'
      if (articleId) {
        const done = await finishGated(articleId, action, { payload: runtime.payload, socialQueue: runtime.queues.social, redis: runtime.redis, mediaQueue: runtime.queues.media })
        if (!done) logger.warn({ articleId }, 'gate command for a story that is not waiting')
      }
      break
    }
    case 'pitch': {
      if (clusterId) {
        const action = cmd.payload?.action === 'reject' ? 'reject' : 'write'
        const done = await decidePitch(clusterId, action, { payload: runtime.payload, writeQueue: runtime.queues.write, redis: runtime.redis }, cmd.payload?.note ?? '')
        if (!done) logger.warn({ clusterId }, 'pitch command for a story that is not waiting')
      }
      break
    }
    case 'ingest': {
      const { sources } = await runtime.payload.getSources()
      for (const s of sources) {
        await runtime.queues.ingest.add('poll', { sourceId: s.id, url: s.url, type: s.type, etag: null, lang: s.language })
      }
      break
    }
  }
  logger.info({ kind: cmd.kind, clusterId }, 'control-room command handled')
}

export async function sendHeartbeat(runtime: WorkerRuntime): Promise<void> {
  const queues: Record<string, { waiting: number; delayed: number; active: number; failed: number }> = {}
  for (const name of QUEUE_NAMES) {
    const c = await runtime.queues[name].getJobCounts('waiting', 'prioritized', 'delayed', 'active', 'failed')
    queues[name] = {
      waiting: (c.waiting ?? 0) + (c.prioritized ?? 0) + (c.delayed ?? 0),
      delayed: c.delayed ?? 0,
      active: c.active ?? 0,
      failed: c.failed ?? 0,
    }
  }
  const health = await runtime.router.health()
  const trends = await readJson<{ at: string; trends: { query: string; trafficLabel: string }[] }>(runtime, TRENDS_KEY)
  const xTrends = await readJson<{ at: string; trends: { name: string; postsLabel?: string }[] }>(runtime, X_TRENDS_KEY)

  const res = await runtime.payload.heartbeat({
    version: runtime.env.WORKER_VERSION,
    queues,
    paused: runtime.paused,
    integrations: {
      ollama: health.ollama,
      gemini: health.gemini,
      extension: runtime.bridge.isOnline(),
      telegram: Boolean(runtime.telegram.bot),
    },
    trends: trends ? { at: trends.at, items: trends.trends.slice(0, 12).map((t) => ({ name: t.query, traffic: t.trafficLabel })) } : null,
    geminiCooldowns: geminiModelStatus(),
    xTrends: xTrends ? { at: xTrends.at, items: xTrends.trends.slice(0, 12).map((t) => ({ name: t.name, traffic: t.postsLabel })) } : null,
  })

  if (res.killSwitch && !runtime.paused) {
    logger.warn('killSwitch=true — pausing queues')
    await pauseAll(runtime)
    runtime.pausedByKillSwitch = true
  } else if (!res.killSwitch && runtime.pausedByKillSwitch) {
    logger.info('killSwitch cleared — resuming queues')
    await resumeAll(runtime)
    runtime.pausedByKillSwitch = false
  }
  for (const cmd of res.commands ?? []) {
    await handleCommand(runtime, cmd).catch((e) => logger.warn({ err: e, cmd }, 'command failed'))
  }
}

export function startHeartbeat(runtime: WorkerRuntime): ReturnType<typeof setInterval> {
  let beats = 0
  let ticks = 0
  const beat = () => {
    // Every ~15 minutes: breaking flags older than 24 h come off (ZAV-143)
    if (++ticks % 45 === 1) {
      void runtime.payload.expireBreaking().then(
        (r) => void (r.expired.length && logger.info({ articles: r.expired }, 'breaking flags expired')),
        (e) => logger.warn({ err: e }, 'breaking expiry failed'),
      )
    }
    // Every ~15 minutes: LIVE badges on stories with no live update for 4 h come off (ZAV-214)
    if (ticks % 45 === 2) {
      void runtime.payload.expireLive().then(
        (r) => void (r.expired.length && logger.info({ articles: r.expired }, 'live flags expired')),
        (e) => logger.warn({ err: e }, 'live expiry failed'),
      )
    }
    // Every ~5 minutes: if the editor gate holds stories but nothing went out for a while, publish one
    if (runtime.env.EDITOR_GATE && ++beats % 15 === 0) {
      void gateFallback({ payload: runtime.payload, socialQueue: runtime.queues.social, redis: runtime.redis, mediaQueue: runtime.queues.media }, runtime.env.EDITOR_GATE_FALLBACK_MIN).catch((e) =>
        logger.warn({ err: e }, 'gate fallback failed'),
      )
      if (runtime.env.EDITOR_PITCH) {
        void pitchFallback({ payload: runtime.payload, writeQueue: runtime.queues.write, redis: runtime.redis }, runtime.env.EDITOR_GATE_FALLBACK_MIN).catch((e) =>
          logger.warn({ err: e }, 'pitch fallback failed'),
        )
      }
    }
    return sendHeartbeat(runtime).catch((e) => logger.warn({ err: e }, 'heartbeat failed'))
  }
  void beat()
  // Every 20s so Control Room buttons feel responsive.
  return setInterval(beat, 20_000)
}
