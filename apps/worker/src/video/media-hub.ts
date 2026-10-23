/**
 * Media hub: the video service asks for voice and picture jobs, a small agent on Waleed's Mac (local models: Urdu
 * Matcha-TTS, SDXS, Z-Image Turbo) claims them over HTTPS and uploads the files. The Mac only ever connects out.
 *
 *   video service --enqueue--> Redis lists  <--claim (long poll)-- Mac agent --PUT result--> files in dataDir/assets
 *
 * Jobs survive restarts (Redis), a claimed job has a lease and goes back to the queue if the Mac disappears,
 * and every request has a deadline so callers can fall back (a server-side voice or a paid image API).
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { logger } from '../logger.js'

export type MediaKind = 'tts' | 'image'

export interface TtsPayload {
  /** Sentences already spelled out by toSpeechText (Urdu letters only) */
  sentences: string[]
  /** Matcha length scale: 0.9 is the chosen "fast" voice */
  lengthScale?: number
}
export interface ImagePayload {
  prompt: string
  width: number
  height: number
  /** fast: SDXS (seconds, simple scenes); good: Z-Image Turbo (minutes, better) */
  quality: 'fast' | 'good'
  seed?: number
}

export interface MediaJob {
  id: string
  kind: MediaKind
  payload: TtsPayload | ImagePayload
  status: 'queued' | 'leased' | 'done' | 'failed'
  attempts: number
  createdAt: number
  leasedUntil?: number
  agent?: string
  file?: string
  contentType?: string
  meta?: Record<string, unknown>
  error?: string
}

/** The few Redis commands the hub uses (ioredis satisfies this; tests use a Map). */
export interface HubStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, exSeconds?: number): Promise<void>
  push(list: string, value: string): Promise<void>
  pop(list: string): Promise<string | null>
  remove(list: string, value: string): Promise<void>
  all(list: string): Promise<string[]>
}

export const LEASE_MS: Record<MediaKind, number> = { tts: 10 * 60_000, image: 25 * 60_000 }
const MAX_ATTEMPTS = 3
const JOB_TTL_S = 3 * 24 * 3600

export class MediaHub {
  constructor(private store: HubStore, private dataDir: string, private now: () => number = Date.now, private pollMs = 5000) {
    mkdirSync(path.join(dataDir, 'assets'), { recursive: true })
  }

  private key = (id: string) => `media:job:${id}`
  private list = (kind: MediaKind) => `media:q:${kind}`

  private async save(job: MediaJob): Promise<void> {
    await this.store.set(this.key(job.id), JSON.stringify(job), JOB_TTL_S)
  }

  async get(id: string): Promise<MediaJob | null> {
    const raw = await this.store.get(this.key(id))
    return raw ? (JSON.parse(raw) as MediaJob) : null
  }

  async enqueue(kind: MediaKind, payload: TtsPayload | ImagePayload, id: string = randomUUID()): Promise<string> {
    if (await this.get(id)) return id
    await this.save({ id, kind, payload, status: 'queued', attempts: 0, createdAt: this.now() })
    await this.store.push(this.list(kind), id)
    return id
  }

  /** Puts jobs whose lease ran out back in the queue (or fails them after three tries). */
  async reapExpired(): Promise<void> {
    for (const kind of ['tts', 'image'] as const) {
      for (const id of await this.store.all(`media:leased:${kind}`)) {
        const job = await this.get(id)
        if (!job || job.status !== 'leased') {
          await this.store.remove(`media:leased:${kind}`, id)
          continue
        }
        if ((job.leasedUntil ?? 0) > this.now()) continue
        await this.store.remove(`media:leased:${kind}`, id)
        await this.retryOrFail(job, 'lease expired: the agent did not answer')
      }
    }
  }

  private async retryOrFail(job: MediaJob, error: string): Promise<void> {
    job.attempts += 1
    job.error = error
    if (job.attempts >= MAX_ATTEMPTS) {
      job.status = 'failed'
      await this.save(job)
      return
    }
    job.status = 'queued'
    delete job.leasedUntil
    await this.save(job)
    await this.store.push(this.list(job.kind), job.id)
  }

  /** One job of the wanted kinds, or null. Images wait behind voice jobs: a voice is quick and blocks a video more. */
  async claim(kinds: MediaKind[], agent: string): Promise<MediaJob | null> {
    await this.reapExpired()
    for (const kind of kinds) {
      for (;;) {
        const id = await this.store.pop(this.list(kind))
        if (!id) break
        const job = await this.get(id)
        if (!job || job.status !== 'queued') continue
        job.status = 'leased'
        job.agent = agent
        job.leasedUntil = this.now() + LEASE_MS[kind]
        await this.save(job)
        await this.store.push(`media:leased:${kind}`, id)
        return job
      }
    }
    return null
  }

  async complete(id: string, body: Buffer, contentType: string, meta: Record<string, unknown> = {}): Promise<boolean> {
    const job = await this.get(id)
    if (!job || job.status !== 'leased') return false
    const ext = /wav/.test(contentType) ? 'wav' : /png/.test(contentType) ? 'png' : /jpe?g/.test(contentType) ? 'jpg' : 'bin'
    const file = path.join('assets', `${id}.${ext}`)
    writeFileSync(path.join(this.dataDir, file), body)
    job.status = 'done'
    job.file = file
    job.contentType = contentType
    job.meta = meta
    delete job.error
    await this.save(job)
    await this.store.remove(`media:leased:${job.kind}`, id)
    return true
  }

  async fail(id: string, error: string): Promise<void> {
    const job = await this.get(id)
    if (!job || job.status !== 'leased') return
    await this.store.remove(`media:leased:${job.kind}`, id)
    await this.retryOrFail(job, error.slice(0, 300))
  }

  readFile(job: MediaJob): Buffer | null {
    if (!job.file) return null
    const p = path.join(this.dataDir, job.file)
    return existsSync(p) ? readFileSync(p) : null
  }

  /** Waits until the job is done or failed, or the deadline passes. */
  async waitFor(id: string, deadlineMs: number, pollMs = this.pollMs): Promise<MediaJob | null> {
    const until = this.now() + deadlineMs
    for (;;) {
      const job = await this.get(id)
      if (job && (job.status === 'done' || job.status === 'failed')) return job
      if (this.now() >= until) return job
      await new Promise((r) => setTimeout(r, pollMs))
    }
  }

  /** How long ago an agent last asked for work (for the control room and the fallback decision). */
  async agentSeenAt(): Promise<number> {
    const v = await this.store.get('media:agent:seen')
    return v ? Number(v) : 0
  }
  async markAgentSeen(): Promise<void> {
    await this.store.set('media:agent:seen', String(this.now()), 3600)
  }
}

// ---- HTTP -----------------------------------------------------------------------------------

function authorised(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

/** Extra authenticated routes (the explainer ideas for the editor): return null to say "not mine". */
export type ExtraRoutes = (method: string, pathname: string, body: unknown) => Promise<{ status: number; body?: unknown } | null>

export function startMediaHubServer(hub: MediaHub, opts: { port: number; token: string; host?: string; extra?: ExtraRoutes }): Server {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://hub')
      if (url.pathname === '/health') return send(res, 200, { ok: true })
      if (!authorised(req, opts.token)) return send(res, 401, { error: 'unauthorised' })
      await hub.markAgentSeen()

      if (req.method === 'POST' && url.pathname === '/claim') {
        const body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}') as { agent?: string; kinds?: MediaKind[]; waitSec?: number }
        const kinds = (body.kinds ?? ['tts', 'image']).filter((k): k is MediaKind => k === 'tts' || k === 'image')
        const until = Date.now() + Math.min(Math.max(body.waitSec ?? 20, 0), 30) * 1000
        for (;;) {
          const job = await hub.claim(kinds, body.agent ?? 'agent')
          if (job) return send(res, 200, { id: job.id, kind: job.kind, payload: job.payload, attempts: job.attempts })
          if (Date.now() >= until || res.destroyed) return send(res, 204)
          await new Promise((r) => setTimeout(r, 1000))
        }
      }

      const m = /^\/(result|fail)\/([A-Za-z0-9-]{8,64})$/.exec(url.pathname)
      if (req.method === 'PUT' && m?.[1] === 'result') {
        const body = await readBody(req, 40 * 1024 * 1024)
        const meta = JSON.parse(String(req.headers['x-meta'] ?? '{}')) as Record<string, unknown>
        const ok = await hub.complete(m[2]!, body, String(req.headers['content-type'] ?? 'application/octet-stream'), meta)
        return send(res, ok ? 200 : 409, { ok })
      }
      if (req.method === 'POST' && m?.[1] === 'fail') {
        const body = JSON.parse((await readBody(req, 16 * 1024)).toString() || '{}') as { error?: string }
        await hub.fail(m[2]!, body.error ?? 'agent error')
        return send(res, 200, { ok: true })
      }
      if (opts.extra) {
        const raw = req.method === 'GET' ? '' : (await readBody(req, 256 * 1024)).toString()
        let parsed: unknown = {}
        try {
          parsed = raw ? JSON.parse(raw) : {}
        } catch {
          return send(res, 400, { error: 'invalid JSON' })
        }
        const handled = await opts.extra(req.method ?? 'GET', url.pathname, parsed)
        if (handled) return send(res, handled.status, handled.body)
      }
      return send(res, 404, { error: 'not found' })
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : e }, 'media hub request failed')
      if (!res.headersSent) send(res, 500, { error: 'server error' })
    }
  })
  server.listen(opts.port, opts.host ?? '0.0.0.0', () => logger.info({ port: opts.port }, 'media hub listening'))
  return server
}

/** Redis-backed store (ioredis). */
export function redisHubStore(redis: {
  get(k: string): Promise<string | null>
  set(k: string, v: string, ...a: unknown[]): Promise<unknown>
  rpush(k: string, v: string): Promise<unknown>
  lpop(k: string): Promise<string | null>
  lrem(k: string, n: number, v: string): Promise<unknown>
  lrange(k: string, a: number, b: number): Promise<string[]>
}): HubStore {
  return {
    get: (k) => redis.get(k),
    set: async (k, v, ex) => void (ex ? await redis.set(k, v, 'EX', ex) : await redis.set(k, v)),
    push: async (l, v) => void (await redis.rpush(l, v)),
    pop: (l) => redis.lpop(l),
    remove: async (l, v) => void (await redis.lrem(l, 0, v)),
    all: (l) => redis.lrange(l, 0, -1),
  }
}

/** In-memory store for tests and local runs. */
export function memoryHubStore(): HubStore {
  const kv = new Map<string, string>()
  const lists = new Map<string, string[]>()
  const l = (n: string) => lists.get(n) ?? (lists.set(n, []), lists.get(n)!)
  return {
    get: async (k) => kv.get(k) ?? null,
    set: async (k, v) => void kv.set(k, v),
    push: async (n, v) => void l(n).push(v),
    pop: async (n) => l(n).shift() ?? null,
    remove: async (n, v) => void lists.set(n, l(n).filter((x) => x !== v)),
    all: async (n) => [...l(n)],
  }
}
