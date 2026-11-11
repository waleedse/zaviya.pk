import { orderScore, type YtItem } from './plan.js'

/** The Redis commands the queue uses (ioredis satisfies this; tests use a small in-memory fake) */
export interface YtRedis {
  hget(key: string, field: string): Promise<string | null>
  hset(key: string, field: string, value: string): Promise<unknown>
  hdel(key: string, field: string): Promise<unknown>
  hgetall(key: string): Promise<Record<string, string>>
  hlen(key: string): Promise<number>
  zadd(key: string, score: number, member: string): Promise<unknown>
  zrem(key: string, member: string): Promise<unknown>
  zrange(key: string, start: number, stop: number): Promise<string[]>
  zcard(key: string): Promise<number>
}

const K = {
  items: 'yt:items',
  order: 'yt:order',
  done: 'yt:done',
  skipped: 'yt:skipped',
  failed: 'yt:failed',
  state: 'yt:state',
  /** token -> file path, written by the uploader and read by the media hub (own key space, see fileKey) */
}
export const fileKey = (token: string) => `yt:file:${token}`

export interface YtState {
  /** no uploads before this time (daily limit, a person is needed, extension out of date) */
  pausedUntil?: number
  pauseReason?: string
  lastUploadAt?: number
  /** the item being uploaded right now: after a restart its outcome is unknown, so it is never repeated blindly */
  inflight?: string
}

export interface DoneRecord {
  videoId: string
  url: string
  at: number
  title: string
  short: boolean
}

export type EnqueueResult = 'queued' | 'exists' | 'skipped'

export class YtStore {
  constructor(private readonly r: YtRedis) {}

  /** queued, uploaded, skipped or failed before: one video is never handled twice */
  async known(id: string): Promise<'queued' | 'done' | 'skipped' | 'failed' | null> {
    if (await this.r.hget(K.items, id)) return 'queued'
    if (await this.r.hget(K.done, id)) return 'done'
    if (await this.r.hget(K.skipped, id)) return 'skipped'
    if (await this.r.hget(K.failed, id)) return 'failed'
    return null
  }

  async enqueue(item: YtItem): Promise<EnqueueResult> {
    if (await this.known(item.id)) return 'exists'
    await this.r.hset(K.items, item.id, JSON.stringify(item))
    await this.r.zadd(K.order, orderScore(item), item.id)
    return 'queued'
  }

  async skip(id: string, key: string, reason: string, now = Date.now()): Promise<void> {
    if (await this.known(id)) return
    await this.r.hset(K.skipped, id, JSON.stringify({ key, reason, at: now }))
  }

  async peek(): Promise<YtItem | null> {
    for (const id of await this.r.zrange(K.order, 0, 4)) {
      const raw = await this.r.hget(K.items, id)
      if (raw) return JSON.parse(raw) as YtItem
      await this.r.zrem(K.order, id)
    }
    return null
  }

  async get(id: string): Promise<YtItem | null> {
    const raw = await this.r.hget(K.items, id)
    return raw ? (JSON.parse(raw) as YtItem) : null
  }

  async update(item: YtItem): Promise<void> {
    await this.r.hset(K.items, item.id, JSON.stringify(item))
  }

  private async leave(id: string): Promise<void> {
    await this.r.hdel(K.items, id)
    await this.r.zrem(K.order, id)
  }

  async complete(item: YtItem, rec: DoneRecord): Promise<void> {
    await this.r.hset(K.done, item.id, JSON.stringify({ ...rec, key: item.key }))
    await this.leave(item.id)
  }

  async fail(item: YtItem, error: string, now = Date.now()): Promise<void> {
    await this.r.hset(K.failed, item.id, JSON.stringify({ key: item.key, error, at: now }))
    await this.leave(item.id)
  }

  async state(): Promise<YtState> {
    const raw = await this.r.hgetall(K.state)
    return {
      pausedUntil: raw.pausedUntil ? Number(raw.pausedUntil) : undefined,
      pauseReason: raw.pauseReason || undefined,
      lastUploadAt: raw.lastUploadAt ? Number(raw.lastUploadAt) : undefined,
      inflight: raw.inflight || undefined,
    }
  }

  async setState(patch: Partial<Record<keyof YtState, string | number | null>>): Promise<void> {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') await this.r.hdel(K.state, k)
      else await this.r.hset(K.state, k, String(v))
    }
  }

  /** The counts and the skipped list, for the backfill report and the status line */
  async report(): Promise<{ queued: number; done: number; skipped: number; failed: number; skippedList: { key: string; reason: string }[] }> {
    const [queued, done, skipped, failed, skippedAll] = await Promise.all([
      this.r.zcard(K.order),
      this.r.hlen(K.done),
      this.r.hlen(K.skipped),
      this.r.hlen(K.failed),
      this.r.hgetall(K.skipped),
    ])
    return {
      queued,
      done,
      skipped,
      failed,
      skippedList: Object.values(skippedAll).map((v) => JSON.parse(v) as { key: string; reason: string }),
    }
  }

  async doneRecords(): Promise<(DoneRecord & { key: string })[]> {
    return Object.values(await this.r.hgetall(K.done)).map((v) => JSON.parse(v) as DoneRecord & { key: string })
  }
}
