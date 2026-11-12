import { describe, it, expect, vi } from 'vitest'
import { QuotaExhaustedError } from '@zaviya/llm'
import { guessDesk, triagePriority, loneLowDeskReject, backoffMs } from './triage-order.js'
import { processTriageJob } from './triage.js'

const now = Date.parse('2026-11-12T12:00:00Z')
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()
const cl = (title: string, o: { sources?: number; ageH?: number; summary?: string; src?: string } = {}) => ({
  headline: title,
  distinctSources: o.sources ?? 2,
  items: [{ title, summary: o.summary, publishedAt: hoursAgo(o.ageH ?? 1), source: { name: o.src ?? 'Dawn' } }],
})
const weights = { 'education-jobs': 1.5, pakistan: 0.77, world: 0.6, ai: 0.6, cricket: 0.6 }

describe('guessDesk', () => {
  it('reads the desk from the headline', () => {
    expect(guessDesk(cl('Pakistan beat Bangladesh in the second T20'))).toBe('cricket')
    expect(guessDesk(cl('OpenAI launches a new model'))).toBe('ai')
    expect(guessDesk(cl('PPSC announces 1,200 vacancies'))).toBe('education-jobs')
    expect(guessDesk(cl('Lahore smog: schools closed'))).toBe('pakistan')
    expect(guessDesk(cl('Floods hit northern Italy'))).toBe('world')
  })
})

describe('triagePriority: the quota goes to the best clusters first', () => {
  const p = (c: ReturnType<typeof cl>) => triagePriority(c, { weights, now })
  it('orders trend hit, then 2+ outlets, then desk weight, then lone outlets, then recency', () => {
    const trend = p(cl('Budget 2026', { summary: 'Trend gap: budget 2026', sources: 1 }))
    const jobs = p(cl('PPSC announces 1,200 vacancies'))
    const pak = p(cl('Lahore smog: schools closed'))
    const world = p(cl('Floods hit northern Italy'))
    const lonePak = p(cl('Lahore smog: schools closed', { sources: 1 }))
    const loneWorld = p(cl('Floods hit northern Italy', { sources: 1 }))
    expect(trend).toBeLessThan(jobs)
    expect(jobs).toBeLessThan(pak)
    expect(pak).toBeLessThan(world)
    expect(world).toBeLessThan(lonePak)
    expect(lonePak).toBeLessThan(loneWorld)
  })
  it('within a tier, fresher first; editor and trend-gap jobs (priority 1-2) stay ahead of all', () => {
    expect(p(cl('Lahore smog', { ageH: 1 }))).toBeLessThan(p(cl('Lahore smog', { ageH: 9 })))
    expect(p(cl('Floods in Italy', { sources: 1, ageH: 40 }))).toBeGreaterThan(2)
    expect(p(cl('Trend', { summary: 'Trend gap: x', ageH: 40 }))).toBeGreaterThan(2)
  })
})

describe('loneLowDeskReject: close by rule after 6 h, never Pakistan or trending', () => {
  const r = (c: ReturnType<typeof cl>) => loneLowDeskReject(c, { weights, now })
  it('closes a lone world/ai/cricket cluster that waited 6 h', () => {
    expect(r(cl('Floods hit northern Italy', { sources: 1, ageH: 7 }))).toMatch(/closed by rule/)
    expect(r(cl('OpenAI launches a new model', { sources: 1, ageH: 7 }))).toMatch(/ai desk/)
  })
  it('keeps younger, two-outlet, trending and Pakistan-desk (0.77) clusters', () => {
    expect(r(cl('Floods hit northern Italy', { sources: 1, ageH: 3 }))).toBeNull()
    expect(r(cl('Floods hit northern Italy', { sources: 2, ageH: 9 }))).toBeNull()
    expect(r(cl('Floods hit northern Italy', { sources: 1, ageH: 9, summary: 'Trend gap: floods' }))).toBeNull()
    expect(r(cl('Lahore smog: schools closed', { sources: 1, ageH: 9 }))).toBeNull()
  })
})

describe('triage backoff', () => {
  it('is 10-15 minutes with jitter', () => {
    for (let i = 0; i < 40; i++) {
      const b = backoffMs()
      expect(b).toBeGreaterThanOrEqual(10 * 60_000)
      expect(b).toBeLessThan(15 * 60_000)
    }
  })
  it('requeues a quota-exhausted cluster 10-15+ min out (not ~65 s) with its quota-order priority', async () => {
    const add = vi.fn()
    const payload = {
      getCluster: vi.fn().mockResolvedValue({ id: '1', headline: 'Lahore smog', items: [{ title: 'Lahore smog', publishedAt: new Date().toISOString(), source: { name: 'Dawn', trustTier: 1 } }], maxTier: 1, distinctSources: 2, itemCount: 1 }),
      getSettings: vi.fn().mockResolvedValue({ categoryWeights: weights }),
      patchCluster: vi.fn(),
    }
    const router = { chat: vi.fn().mockRejectedValue(new QuotaExhaustedError(Date.now() + 70_000, { a: 'cooling', b: 'tpm' })) }
    await processTriageJob({ clusterId: '1' }, { router, payload, writeQueue: {}, triageQueue: { add } } as never)
    const opts = add.mock.calls[0]![2]
    expect(opts.delay).toBeGreaterThanOrEqual(10 * 60_000)
    expect(opts.delay).toBeLessThan(15 * 60_000 + 10_000)
    expect(opts.priority).toBeGreaterThanOrEqual(30)
  })
})
