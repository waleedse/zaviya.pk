import type { LlmPriority } from './types.js'

/**
 * Per-model Gemini free-tier budget (requests/minute, requests/day, tokens/minute), shared by every worker
 * process through Redis. A call asks for budget before it is made, so a model is never hammered until 429.
 *
 * The AI Studio docs do not publish per-model numbers (they are per project, shown in the AI Studio dashboard),
 * so the defaults below are the last published free-tier values for each model family, rounded down; any model
 * can be overridden with GEMINI_LIMITS (JSON) in the worker env.
 */
export interface ModelLimits {
  rpm: number
  rpd: number
  tpm: number
}

export const FLASH_LIMITS: ModelLimits = { rpm: 10, rpd: 250, tpm: 250_000 }
export const LITE_LIMITS: ModelLimits = { rpm: 15, rpd: 1000, tpm: 250_000 }
// 12 Nov: gemma answered 429 at 15 rpm / 15k tpm (84 in a day), so stay under both
export const GEMMA_LIMITS: ModelLimits = { rpm: 10, rpd: 1500, tpm: 10_000 }
export const PREVIEW_LIMITS: ModelLimits = { rpm: 5, rpd: 100, tpm: 250_000 }
/** A model nobody listed: stay well under any free tier. */
export const UNKNOWN_LIMITS: ModelLimits = { rpm: 5, rpd: 100, tpm: 100_000 }

export function defaultLimits(model: string): ModelLimits {
  if (model.startsWith('gemma')) return GEMMA_LIMITS
  if (/preview|exp/.test(model)) return PREVIEW_LIMITS
  if (/flash-lite/.test(model)) return LITE_LIMITS
  if (/^gemini-[\d.]+-flash$/.test(model)) return FLASH_LIMITS
  return UNKNOWN_LIMITS
}

/**
 * Share of a model's daily budget kept back from each priority: a tier may only use a model while more than this
 * share of the day is left, so SEO and social cannot spend what writing and triage need.
 */
export const DEFAULT_RESERVE: Record<LlmPriority, number> = { urgent: 0, core: 0, qa: 0.08, low: 0.2 }

/** How long a tier waits for the per-minute window to free up before it gives up (and the caller requeues). */
export const MAX_WAIT_MS: Record<LlmPriority, number> = { urgent: 60_000, core: 45_000, qa: 30_000, low: 8_000 }

export type DenyReason = 'rpm' | 'tpm' | 'rpd' | 'reserve' | 'cooling'
export type Verdict = { ok: true } | { ok: false; reason: DenyReason; retryAt: number }

export interface ReserveArgs {
  model: string
  limits: ModelLimits
  estTokens: number
  /** share of the daily budget this priority must leave untouched */
  reserveFrac: number
  task: string
  now: number
}

export interface ModelUsage {
  model: string
  day: string
  calls: number
  tokens: number
  rpmUsed: number
  tpmUsed: number
  byTask: Record<string, number>
  rateLimited: number
  recitation: number
  blocked: number
  coolingUntil: number | null
}

export interface BudgetStore {
  /** Atomically check every limit and, if there is room, count the call. */
  reserve(a: ReserveArgs): Promise<Verdict>
  /** Correct the token count once the real usage is known (actual minus estimate). */
  settle(model: string, deltaTokens: number, now: number): Promise<void>
  /** The API itself said 429: leave this model alone until then. */
  cool(model: string, untilMs: number, now: number): Promise<void>
  /** Bump a metric counter: 'rateLimited' | 'recitation' | 'blocked'. */
  note(model: string, field: 'rateLimited' | 'recitation' | 'blocked', now: number): Promise<void>
  usage(model: string, now: number): Promise<ModelUsage>
}

const PACIFIC = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Gemini's daily quota resets at midnight Pacific. */
export function pacificDay(now: number): { day: string; msToReset: number } {
  const p = Object.fromEntries(PACIFIC.formatToParts(new Date(now)).map((x) => [x.type, x.value])) as Record<string, string>
  const sinceMidnight = (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000 + (now % 1000)
  return { day: `${p.year}-${p.month}-${p.day}`, msToReset: Math.max(1000, 86_400_000 - sinceMidnight) }
}

export const minuteBucket = (now: number) => Math.floor(now / 60_000)
export const msToNextMinute = (now: number) => 60_000 - (now % 60_000)

type Counters = Record<string, number>

/** In-process store: used in tests, and when Redis is not configured or is down. */
export class MemoryBudgetStore implements BudgetStore {
  private readonly data = new Map<string, Counters>()
  private readonly cooling = new Map<string, number>()

  private row(key: string): Counters {
    let r = this.data.get(key)
    if (!r) this.data.set(key, (r = {}))
    return r
  }

  async reserve(a: ReserveArgs): Promise<Verdict> {
    const { day, msToReset } = pacificDay(a.now)
    const until = this.cooling.get(a.model) ?? 0
    if (until > a.now) return { ok: false, reason: 'cooling', retryAt: until }
    const d = this.row(`d:${day}:${a.model}`)
    const m = this.row(`m:${minuteBucket(a.now)}:${a.model}`)
    const used = d.calls ?? 0
    if (used >= a.limits.rpd) return { ok: false, reason: 'rpd', retryAt: a.now + msToReset }
    if (a.reserveFrac > 0 && a.limits.rpd - used - 1 < a.limits.rpd * a.reserveFrac) {
      return { ok: false, reason: 'reserve', retryAt: a.now + msToReset }
    }
    const next = a.now + msToNextMinute(a.now)
    if ((m.calls ?? 0) >= a.limits.rpm) return { ok: false, reason: 'rpm', retryAt: next }
    // an oversized single prompt is let through on an empty minute, otherwise it could never run
    if ((m.tokens ?? 0) > 0 && (m.tokens ?? 0) + a.estTokens > a.limits.tpm) return { ok: false, reason: 'tpm', retryAt: next }
    m.calls = (m.calls ?? 0) + 1
    m.tokens = (m.tokens ?? 0) + a.estTokens
    d.calls = used + 1
    d.tokens = (d.tokens ?? 0) + a.estTokens
    d[`task:${a.task}`] = (d[`task:${a.task}`] ?? 0) + 1
    return { ok: true }
  }

  async settle(model: string, deltaTokens: number, now: number): Promise<void> {
    const m = this.row(`m:${minuteBucket(now)}:${model}`)
    m.tokens = Math.max(0, (m.tokens ?? 0) + deltaTokens)
    const d = this.row(`d:${pacificDay(now).day}:${model}`)
    d.tokens = Math.max(0, (d.tokens ?? 0) + deltaTokens)
  }

  async cool(model: string, untilMs: number, _now?: number): Promise<void> {
    this.cooling.set(model, untilMs)
  }

  async note(model: string, field: string, now: number): Promise<void> {
    const d = this.row(`d:${pacificDay(now).day}:${model}`)
    d[field] = (d[field] ?? 0) + 1
  }

  async usage(model: string, now: number): Promise<ModelUsage> {
    const day = pacificDay(now).day
    return toUsage(model, day, this.row(`d:${day}:${model}`), this.row(`m:${minuteBucket(now)}:${model}`), this.cooling.get(model) ?? 0, now)
  }
}

function toUsage(model: string, day: string, d: Counters, m: Counters, cooling: number, now: number): ModelUsage {
  const byTask: Record<string, number> = {}
  for (const [k, v] of Object.entries(d)) if (k.startsWith('task:')) byTask[k.slice(5)] = v
  return {
    model,
    day,
    calls: d.calls ?? 0,
    tokens: d.tokens ?? 0,
    rpmUsed: m.calls ?? 0,
    tpmUsed: m.tokens ?? 0,
    byTask,
    rateLimited: d.rateLimited ?? 0,
    recitation: d.recitation ?? 0,
    blocked: d.blocked ?? 0,
    coolingUntil: cooling > now ? cooling : null,
  }
}

/** The slice of ioredis the store needs (loosely typed so any ioredis version fits). */
export interface RedisLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eval(script: string, numKeys: number, ...args: any[]): Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hincrby(key: string, field: string, n: number): Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hgetall(key: string): Promise<Record<string, string>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expire(key: string, seconds: number): Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(key: string, value: string, mode: 'PX', ms: number): Promise<any>
  pttl(key: string): Promise<number>
}

/**
 * KEYS: cooling, minute hash, day hash. ARGV: now, rpm, rpd, tpm, est, reserveFrac, task, msToNextMinute, msToReset.
 * Returns {1} when the call is counted, else {0, reason, retryAtMs}.
 */
const RESERVE_LUA = `
local now = tonumber(ARGV[1])
local cool = redis.call('PTTL', KEYS[1])
if cool > 0 then return {0, 'cooling', now + cool} end
local rpm, rpd, tpm, est, frac = tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])
local used = tonumber(redis.call('HGET', KEYS[3], 'calls') or '0')
if used >= rpd then return {0, 'rpd', now + tonumber(ARGV[9])} end
if frac > 0 and (rpd - used - 1) < rpd * frac then return {0, 'reserve', now + tonumber(ARGV[9])} end
local mc = tonumber(redis.call('HGET', KEYS[2], 'calls') or '0')
local mt = tonumber(redis.call('HGET', KEYS[2], 'tokens') or '0')
if mc >= rpm then return {0, 'rpm', now + tonumber(ARGV[8])} end
if mt > 0 and mt + est > tpm then return {0, 'tpm', now + tonumber(ARGV[8])} end
redis.call('HINCRBY', KEYS[2], 'calls', 1)
redis.call('HINCRBY', KEYS[2], 'tokens', est)
redis.call('EXPIRE', KEYS[2], 180)
redis.call('HINCRBY', KEYS[3], 'calls', 1)
redis.call('HINCRBY', KEYS[3], 'tokens', est)
redis.call('HINCRBY', KEYS[3], 'task:' .. ARGV[7], 1)
redis.call('EXPIRE', KEYS[3], 259200)
return {1}
`

/** Shared by every worker process. If Redis fails the call falls back to a per-process store instead of failing. */
export class RedisBudgetStore implements BudgetStore {
  private readonly fallback = new MemoryBudgetStore()

  constructor(
    private readonly redis: RedisLike,
    private readonly onError: (e: unknown) => void = () => {},
    private readonly prefix = 'llm:budget',
  ) {}

  private keys(model: string, now: number) {
    return {
      cool: `${this.prefix}:cool:${model}`,
      min: `${this.prefix}:m:${minuteBucket(now)}:${model}`,
      day: `${this.prefix}:d:${pacificDay(now).day}:${model}`,
    }
  }

  async reserve(a: ReserveArgs): Promise<Verdict> {
    try {
      const k = this.keys(a.model, a.now)
      const { msToReset } = pacificDay(a.now)
      const r = (await this.redis.eval(
        RESERVE_LUA, 3, k.cool, k.min, k.day,
        a.now, a.limits.rpm, a.limits.rpd, a.limits.tpm, a.estTokens, a.reserveFrac, a.task, msToNextMinute(a.now), msToReset,
      )) as [number, DenyReason?, number?]
      return r[0] === 1 ? { ok: true } : { ok: false, reason: r[1] as DenyReason, retryAt: Number(r[2]) }
    } catch (e) {
      this.onError(e)
      return this.fallback.reserve(a)
    }
  }

  async settle(model: string, deltaTokens: number, now: number): Promise<void> {
    if (!deltaTokens) return
    try {
      const k = this.keys(model, now)
      await this.redis.hincrby(k.min, 'tokens', deltaTokens)
      await this.redis.hincrby(k.day, 'tokens', deltaTokens)
    } catch (e) {
      this.onError(e)
      await this.fallback.settle(model, deltaTokens, now)
    }
  }

  async cool(model: string, untilMs: number, now: number): Promise<void> {
    await this.fallback.cool(model, untilMs)
    try {
      await this.redis.set(this.keys(model, now).cool, '1', 'PX', Math.max(1000, Math.round(untilMs - now)))
    } catch (e) {
      this.onError(e)
    }
  }

  async note(model: string, field: 'rateLimited' | 'recitation' | 'blocked', now: number): Promise<void> {
    try {
      const k = this.keys(model, now)
      await this.redis.hincrby(k.day, field, 1)
      await this.redis.expire(k.day, 259200)
    } catch (e) {
      this.onError(e)
      await this.fallback.note(model, field, now)
    }
  }

  async usage(model: string, now: number): Promise<ModelUsage> {
    try {
      const k = this.keys(model, now)
      const num = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([f, v]) => [f, Number(v)])) as Counters
      const [d, m, ttl] = await Promise.all([this.redis.hgetall(k.day), this.redis.hgetall(k.min), this.redis.pttl(k.cool)])
      return toUsage(model, pacificDay(now).day, num(d), num(m), ttl > 0 ? now + ttl : 0, now)
    } catch (e) {
      this.onError(e)
      return this.fallback.usage(model, now)
    }
  }
}

export interface BudgetConfig {
  /** Per-model overrides; the key "*" changes the default for every model without its own entry */
  limits?: Record<string, Partial<ModelLimits>>
  reserve?: Partial<Record<LlmPriority, number>>
  maxWaitMs?: Partial<Record<LlmPriority, number>>
}

/** GEMINI_LIMITS='{"gemini-3.8-flash":{"rpd":500},"*":{"rpm":4}}' */
export function parseLimitsEnv(raw: string | undefined): BudgetConfig['limits'] {
  if (!raw?.trim()) return undefined
  try {
    const v = JSON.parse(raw) as Record<string, Partial<ModelLimits>>
    return v && typeof v === 'object' ? v : undefined
  } catch {
    return undefined
  }
}

export type Acquired = { model: string } | { model: null; resetAt: number; reasons: Record<string, DenyReason> }

const sleepMs = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
  })

export class GeminiBudget {
  constructor(
    readonly store: BudgetStore = new MemoryBudgetStore(),
    private readonly cfg: BudgetConfig = {},
    private readonly clock: () => number = Date.now,
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void> = sleepMs,
  ) {}

  limitsFor(model: string): ModelLimits {
    return { ...defaultLimits(model), ...this.cfg.limits?.['*'], ...this.cfg.limits?.[model] }
  }

  reserveFor(p: LlmPriority): number {
    return this.cfg.reserve?.[p] ?? DEFAULT_RESERVE[p]
  }

  maxWaitFor(p: LlmPriority): number {
    return this.cfg.maxWaitMs?.[p] ?? MAX_WAIT_MS[p]
  }

  /**
   * The first model in the chain with budget. If every model is only held back by the per-minute window, wait
   * (up to the priority's limit) for it to open; a spent day, a cooling model or a low-priority reserve count as
   * unavailable and `resetAt` says when the first one frees up.
   */
  async acquire(models: string[], o: { priority: LlmPriority; task: string; estTokens: number; signal?: AbortSignal }): Promise<Acquired> {
    const deadline = this.clock() + this.maxWaitFor(o.priority)
    for (;;) {
      const now = this.clock()
      const reasons: Record<string, DenyReason> = {}
      let soonest = Infinity
      let soonestShort = Infinity
      for (const model of models) {
        const v = await this.store.reserve({
          model,
          limits: this.limitsFor(model),
          estTokens: o.estTokens,
          reserveFrac: this.reserveFor(o.priority),
          task: o.task,
          now,
        })
        if (v.ok) return { model }
        reasons[model] = v.reason
        soonest = Math.min(soonest, v.retryAt)
        if (v.reason === 'rpm' || v.reason === 'tpm') soonestShort = Math.min(soonestShort, v.retryAt)
      }
      // only worth waiting when every model is short-term limited (a cooling or spent model will not open in seconds)
      const allShort = models.length > 0 && Object.values(reasons).every((r) => r === 'rpm' || r === 'tpm')
      if (allShort && soonestShort <= deadline) {
        // jitter: callers waiting on the same minute window must not all wake at the same instant
        await this.sleep(Math.max(250, soonestShort - this.clock() + 50) + Math.floor(Math.random() * 3000), o.signal)
        continue
      }
      return { model: null, resetAt: Number.isFinite(soonest) ? soonest : now + 3_600_000, reasons }
    }
  }

  /** Per-model usage today with the limits and headroom, for logs and the 3-hourly run. */
  async summary(models: string[]) {
    const now = this.clock()
    return Promise.all(
      models.map(async (model) => {
        const limits = this.limitsFor(model)
        const u = await this.store.usage(model, now)
        return { ...u, limits, rpdLeft: Math.max(0, limits.rpd - u.calls), headroomPct: Math.round((Math.max(0, limits.rpd - u.calls) / limits.rpd) * 100) }
      }),
    )
  }
}

/** Rough prompt size for the per-minute token window (Urdu and English both land near 3 chars per token). */
export function estimateTokens(messages: { content: string; images?: unknown[] }[]): number {
  return messages.reduce((n, m) => n + Math.ceil(m.content.length / 2.8) + (m.images?.length ?? 0) * 1300, 0) + 50
}
