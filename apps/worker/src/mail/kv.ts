import type { Redis } from 'ioredis'

/** The little Redis the mail commands need; a Map-backed copy serves tests and the dry-run CLI. */
export interface Kv {
  get(key: string): Promise<string | null>
  /** Returns false only when `nx` was asked for and the key already existed */
  set(key: string, value: string, ttlSec: number, opts?: { nx?: boolean }): Promise<boolean>
  del(key: string): Promise<void>
}

export function redisKv(redis: Redis): Kv {
  return {
    get: (k) => redis.get(k),
    async set(k, v, ttl, opts) {
      const r = opts?.nx ? await redis.set(k, v, 'EX', ttl, 'NX') : await redis.set(k, v, 'EX', ttl)
      return r === 'OK'
    },
    async del(k) {
      await redis.del(k)
    },
  }
}

export function memoryKv(now: () => number = Date.now): Kv & { data: Map<string, { v: string; exp: number }> } {
  const data = new Map<string, { v: string; exp: number }>()
  const live = (k: string) => {
    const e = data.get(k)
    if (e && e.exp <= now()) data.delete(k)
    return data.get(k)
  }
  return {
    data,
    async get(k) {
      return live(k)?.v ?? null
    },
    async set(k, v, ttl, opts) {
      if (opts?.nx && live(k)) return false
      data.set(k, { v, exp: now() + ttl * 1000 })
      return true
    },
    async del(k) {
      data.delete(k)
    },
  }
}
