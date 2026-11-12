import { describe, it, expect, vi } from 'vitest'
import { processPublishJob } from './publish.js'
import { publishRank, rankOffsetMs, staleLowDeskStory, RANK_WINDOW_MS } from './triage-order.js'

const now = Date.parse('2026-11-12T12:00:00Z')
const ago = (h: number) => ({ publishedAt: new Date(now - h * 3_600_000).toISOString() })
const weights = { 'education-jobs': 1.5, pakistan: 0.77, business: 0.9, world: 0.6, ai: 0.6, cricket: 0.6 }
const rank = (category: string, ageH: number, trend = false) => publishRank({ category, trend, items: [ago(ageH)] }, { weights, now })

describe('publish order: trend hit, then desk weight, then freshness (ZG-22)', () => {
  it('ranks trend first, then jobs 1.5, pakistan 0.77, world/ai 0.6, newest first inside a desk', () => {
    expect(rank('world', 10, true)).toBeLessThan(rank('education-jobs', 1))
    expect(rank('education-jobs', 8)).toBeLessThan(rank('pakistan', 1))
    expect(rank('pakistan', 8)).toBeLessThan(rank('world', 1))
    expect(rank('world', 1)).toBeLessThan(rank('ai', 5))
    expect(rank('pakistan', 1)).toBeLessThan(rank('pakistan', 6))
    for (const c of ['education-jobs', 'pakistan', 'world']) expect(rank(c, 40)).toBeLessThan(1)
  })
  it('wakes best-first inside a window shorter than the 10 minute publish gap', () => {
    expect(RANK_WINDOW_MS).toBeLessThan(10 * 60_000)
    expect(rankOffsetMs(rank('education-jobs', 1))).toBeLessThan(rankOffsetMs(rank('world', 1)))
    expect(rankOffsetMs(rank('world', 30))).toBeLessThan(RANK_WINDOW_MS)
  })
  it('drops only a story older than 12 h on a 0.6 desk with no trend hit', () => {
    const s = (category: string, ageH: number, trend = false) => staleLowDeskStory({ category, trend, items: [ago(ageH)] }, { weights, now })
    expect(s('world', 13)).toBe(true)
    expect(s('ai', 13)).toBe(true)
    expect(s('world', 11)).toBe(false)
    expect(s('world', 13, true)).toBe(false)
    expect(s('pakistan', 16)).toBe(false) // 0.77 desk stays
    expect(s('education-jobs', 16)).toBe(false)
  })
})

describe('processPublishJob: stale low-desk story leaves the queue as a draft, nothing deleted', () => {
  const write = { en: { title: 'T', slug: 't', dek: 'd', keyPoints: ['k'], titleOptions: ['T'], bodyMarkdown: Array.from({ length: 200 }, (_, i) => `w${i}`).join(' '), whatItMeans: 'x', faqs: [], tags: [], metaDescription: 'm', altText: 'a' }, promptVersions: { en: 'v' } } as never
  const mk = (category: string, ageH: number) => {
    const items = [{ title: 't', url: 'https://x', publishedAt: new Date(Date.now() - ageH * 3_600_000).toISOString(), source: { name: 'Dawn', trustTier: 1 } }]
    return {
      getCluster: vi.fn(async () => ({ id: '9', items, triage: { category, editorApproved: true } })),
      getSettings: vi.fn(async () => ({ categoryWeights: weights, articlesPublishedToday: 0, lastPublishedAt: new Date().toISOString() })),
      postArticle: vi.fn(async () => ({ id: '55' })),
      patchCluster: vi.fn(async () => ({})),
    }
  }
  const run = async (payload: ReturnType<typeof mk>) => {
    const hset = vi.fn()
    await processPublishJob(
      { clusterId: '9', write, qaScore: 1, priority: 'normal' },
      { payload: payload as never, socialQueue: { add: vi.fn() } as never, publishQueue: { add: vi.fn() } as never, gate: { redis: { hset, set: vi.fn(async () => 'OK'), eval: vi.fn(async () => 1) } as never } } as never,
    )
    return hset
  }
  it('a 14 h old world story is saved as an in_review draft', async () => {
    const payload = mk('world', 14)
    const hset = await run(payload)
    expect(payload.postArticle).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_review' }))
    expect(payload.patchCluster).toHaveBeenCalledWith('9', expect.objectContaining({ status: 'in_review', article: '55' }))
    expect(hset).toHaveBeenCalled()
  })
  it('a 14 h old Pakistan story is not dropped (it is paced and published as before)', async () => {
    const payload = mk('pakistan', 14)
    await run(payload)
    expect(payload.postArticle).not.toHaveBeenCalled() // paced: re-queued for the next slot, not drafted
  })
})
