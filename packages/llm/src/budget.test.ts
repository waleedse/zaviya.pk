import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GeminiBudget, MemoryBudgetStore, RedisBudgetStore, defaultLimits, pacificDay, parseLimitsEnv, type BudgetStore, type RedisLike } from './budget.js'
import { GeminiProvider, isQuotaExhausted } from './gemini.js'

const T0 = Date.UTC(2026, 10, 12, 12, 0, 5) // 12 Nov 2026, 04:00:05 Pacific (PST)

const ok = (text = 'ok') => new Response(JSON.stringify({ id: 'i', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] }), { status: 200 })

function budget(cfg = {}, store: BudgetStore = new MemoryBudgetStore()) {
  const clock = { now: T0 }
  const slept: number[] = []
  const b = new GeminiBudget(store, cfg, () => clock.now, async (ms) => { slept.push(ms); clock.now += ms })
  return { b, clock, slept }
}
const ask = (b: GeminiBudget, models: string[], priority: 'urgent' | 'core' | 'qa' | 'low' = 'core') => b.acquire(models, { priority, task: 't', estTokens: 100 })

describe('limits', () => {
  it('uses family defaults, a conservative default for unknown models, and env overrides', () => {
    expect(defaultLimits('gemini-3.8-flash').rpd).toBe(250)
    expect(defaultLimits('gemini-3.5-flash-lite').rpd).toBe(1000)
    expect(defaultLimits('gemma-4-26b-a4b-it').tpm).toBe(10_000)
    expect(defaultLimits('gemini-9-mystery')).toEqual({ rpm: 5, rpd: 100, tpm: 100_000 })
    const { b } = budget({ limits: { '*': { rpm: 3 }, 'gemini-3.8-flash': { rpd: 7 } } })
    expect(b.limitsFor('gemini-3.8-flash')).toEqual({ rpm: 3, rpd: 7, tpm: 250_000 })
    expect(b.limitsFor('gemini-3.7-flash').rpm).toBe(3)
    expect(parseLimitsEnv('{"a":{"rpd":1}}')).toEqual({ a: { rpd: 1 } })
    expect(parseLimitsEnv('not json')).toBeUndefined()
  })

  it('resets the day at midnight Pacific', () => {
    expect(pacificDay(T0).day).toBe('2026-11-12')
    expect(pacificDay(T0).msToReset).toBeCloseTo(20 * 3600_000 - 5000, -3)
  })
})

describe('model selection', () => {
  it('takes the first model with budget, then the next once the first is out of per-minute calls', async () => {
    const { b } = budget({ limits: { a: { rpm: 2 }, b: { rpm: 2 } } })
    expect(await ask(b, ['a', 'b'])).toEqual({ model: 'a' })
    expect(await ask(b, ['a', 'b'])).toEqual({ model: 'a' })
    expect(await ask(b, ['a', 'b'])).toEqual({ model: 'b' })
  })

  it('waits for the minute window when every model is only RPM-limited', async () => {
    const { b, slept, clock } = budget({ limits: { a: { rpm: 1 } } })
    await ask(b, ['a'], 'urgent')
    expect(await ask(b, ['a'], 'urgent')).toEqual({ model: 'a' })
    expect(slept).toHaveLength(1)
    expect(slept[0]).toBeGreaterThan(50_000)
    expect(slept[0]).toBeLessThanOrEqual(63_100)
    expect(clock.now).toBeGreaterThan(T0 + 54_000)
  })

  it('treats a spent day as unavailable until midnight Pacific and does not wait', async () => {
    const { b, slept } = budget({ limits: { a: { rpd: 2 } } })
    await ask(b, ['a'])
    await ask(b, ['a'])
    const r = await ask(b, ['a'])
    expect(r).toMatchObject({ model: null, reasons: { a: 'rpd' } })
    expect((r as { resetAt: number }).resetAt).toBe(T0 + pacificDay(T0).msToReset)
    expect(slept).toEqual([])
  })

  it('does not wait when the minute wait is longer than the priority allows', async () => {
    const { b } = budget({ limits: { a: { rpm: 1 } }, maxWaitMs: { low: 1000 } })
    await ask(b, ['a'], 'low')
    const r = await ask(b, ['a'], 'low')
    expect(r).toMatchObject({ model: null, reasons: { a: 'rpm' } })
  })

  it('skips a model the API cooled down', async () => {
    const store = new MemoryBudgetStore()
    const { b } = budget({}, store)
    await store.cool('a', T0 + 3_600_000, T0)
    expect(await ask(b, ['a', 'b'])).toEqual({ model: 'b' })
    expect(await ask(b, ['a'])).toMatchObject({ model: null, reasons: { a: 'cooling' } })
  })

  it('limits tokens per minute but lets one oversized prompt through an empty minute', async () => {
    const { b } = budget({ limits: { a: { tpm: 1000 } }, maxWaitMs: { core: 0 } })
    expect(await b.acquire(['a'], { priority: 'core', task: 't', estTokens: 5000 })).toEqual({ model: 'a' })
    expect(await b.acquire(['a'], { priority: 'core', task: 't', estTokens: 10 })).toMatchObject({ model: null, reasons: { a: 'tpm' } })
  })
})

describe('priority reservation', () => {
  it('keeps 20% of the day from low-priority work and 8% from QA, while core and urgent can use it all', async () => {
    const { b } = budget({ limits: { a: { rpd: 100, rpm: 1000 } } })
    // 70 core calls: 30% left
    for (let i = 0; i < 70; i++) expect(await ask(b, ['a'], 'core')).toEqual({ model: 'a' })
    expect(await ask(b, ['a'], 'low')).toEqual({ model: 'a' }) // 29 left after it, still >= 20
    for (let i = 0; i < 9; i++) await ask(b, ['a'], 'core') // 20 left
    expect(await ask(b, ['a'], 'low')).toMatchObject({ model: null, reasons: { a: 'reserve' } })
    expect(await ask(b, ['a'], 'qa')).toEqual({ model: 'a' })
    for (let i = 0; i < 11; i++) await ask(b, ['a'], 'core') // 8 left
    expect(await ask(b, ['a'], 'qa')).toMatchObject({ model: null, reasons: { a: 'reserve' } })
    for (let i = 0; i < 7; i++) expect(await ask(b, ['a'], 'core')).toEqual({ model: 'a' })
    expect(await ask(b, ['a'], 'urgent')).toEqual({ model: 'a' }) // the last call of the day
    expect(await ask(b, ['a'], 'urgent')).toMatchObject({ model: null, reasons: { a: 'rpd' } })
  })

  it('records calls per task and reports headroom', async () => {
    const { b } = budget({ limits: { a: { rpd: 10 } } })
    await b.acquire(['a'], { priority: 'core', task: 'triage', estTokens: 100 })
    await b.acquire(['a'], { priority: 'low', task: 'seo', estTokens: 100 })
    const [s] = await b.summary(['a'])
    expect(s).toMatchObject({ calls: 2, byTask: { triage: 1, seo: 1 }, rpdLeft: 8, headroomPct: 80 })
  })
})

describe('GeminiProvider with a budget', () => {
  beforeEach(() => void vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => void vi.unstubAllGlobals())
  const msgs = [{ role: 'user' as const, content: 'x' }]
  const provider = (cfg = {}) => new GeminiProvider('key', undefined, undefined, 'low', new GeminiBudget(new MemoryBudgetStore(), cfg))

  it('skips gemma on a recitation 400 and answers from the next model, without a quota error', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Request blocked due to copyright/recitation' } }), { status: 400 }))
      .mockResolvedValueOnce(ok('from-b'))
    const p = provider()
    const res = await p.chat({ model: 'gemma-x,gemini-y-flash-lite', messages: msgs, task: 'qa' })
    expect(res.content).toBe('from-b')
    expect(res.model).toBe('gemini-y-flash-lite')
    expect((await p.budget.summary(['gemma-x']))[0]).toMatchObject({ recitation: 1, calls: 1 })
  })

  it('when only recitation stops every model it is a plain error, not a quota or input-blocked failure', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ error: { message: "Request blocked due to copyright/recitation" } }), { status: 400 }))
    const err = await provider().chat({ model: 'gemma-r1,gemma-r2', messages: msgs }).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(isQuotaExhausted(err)).toBe(false)
    expect(err.name).toBe('Error')
  })

  it('does not call the API at all once the day budget is spent: QuotaExhaustedError with the reset time', async () => {
    vi.mocked(fetch).mockImplementation(async () => ok())
    const p = provider({ limits: { 'gemini-d-flash': { rpd: 1 } } })
    await p.chat({ model: 'gemini-d-flash', messages: msgs })
    const err = await p.chat({ model: 'gemini-d-flash', messages: msgs }).catch((e) => e)
    expect(isQuotaExhausted(err)).toBe(true)
    expect(err.resetAt).toBeGreaterThan(Date.now())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('triage spills onto a writer model but leaves half of its day for writing (ZG-22)', async () => {
    vi.mocked(fetch).mockImplementation(async () => ok())
    const p = provider({ limits: { 'gemini-3.8-flash': { rpd: 10, rpm: 100 } } })
    for (let i = 0; i < 5; i++) await expect(p.chat({ model: 'gemini-3.8-flash', messages: msgs, task: 'triage' })).resolves.toMatchObject({ model: 'gemini-3.8-flash' })
    // 5 of 10 used: triage must stop here, even though it is a core task
    await expect(p.chat({ model: 'gemini-3.8-flash', messages: msgs, task: 'triage' })).rejects.toMatchObject({ name: 'QuotaExhaustedError' })
    // writing can still use the rest of the day
    for (let i = 0; i < 5; i++) await expect(p.chat({ model: 'gemini-3.8-flash', messages: msgs, task: 'write_en' })).resolves.toMatchObject({ content: 'ok' })
  })

  it('a low-priority task backs off under 20% while a writer call still gets through', async () => {
    vi.mocked(fetch).mockImplementation(async () => ok())
    const p = provider({ limits: { 'gemini-e-flash': { rpd: 10, rpm: 100 } } })
    for (let i = 0; i < 8; i++) await p.chat({ model: 'gemini-e-flash', messages: msgs, task: 'write_en' })
    await expect(p.chat({ model: 'gemini-e-flash', messages: msgs, task: 'seo' })).rejects.toMatchObject({ name: 'QuotaExhaustedError' })
    await expect(p.chat({ model: 'gemini-e-flash', messages: msgs, task: 'write_en' })).resolves.toMatchObject({ content: 'ok' })
  })
})

// The Lua script itself is exercised against a real Redis by hand (see the PR); here the store's plumbing and fallback.
describe('RedisBudgetStore', () => {
  it('counts through the Lua script like the in-memory store, and falls back when Redis fails', async () => {
    const calls: unknown[][] = []
    const fake: RedisLike = {
      eval: async (...a) => { calls.push(a); return [0, 'rpm', T0 + 1000] },
      hincrby: async () => 1, hgetall: async () => ({ calls: '3', tokens: '30', 'task:triage': '3' }), expire: async () => 1, set: async () => 'OK', pttl: async () => -2,
    }
    const store = new RedisBudgetStore(fake)
    const v = await store.reserve({ model: 'a', limits: { rpm: 1, rpd: 2, tpm: 3 }, estTokens: 4, reserveFrac: 0.2, task: 't', now: T0 })
    expect(v).toEqual({ ok: false, reason: 'rpm', retryAt: T0 + 1000 })
    expect(calls[0]!.slice(1, 2)).toEqual([3])
    expect(await store.usage('a', T0)).toMatchObject({ calls: 3, tokens: 30, byTask: { triage: 3 } })

    const errors: unknown[] = []
    const broken = new RedisBudgetStore({ ...fake, eval: async () => { throw new Error('down') } }, (e) => errors.push(e))
    const args = { model: 'a', limits: { rpm: 1, rpd: 2, tpm: 1000 }, estTokens: 4, reserveFrac: 0, task: 't', now: T0 }
    expect(await broken.reserve(args)).toEqual({ ok: true })
    expect(await broken.reserve(args)).toMatchObject({ ok: false, reason: 'rpm' })
    expect(errors).toHaveLength(2)
  })
})
