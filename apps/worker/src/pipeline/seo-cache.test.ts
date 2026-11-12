import { describe, it, expect, vi } from 'vitest'
import { researchSeo } from './seo.js'

describe('researchSeo cache (ZG-22)', () => {
  it('plans a cluster once: a rewrite after a QA failure reuses the plan instead of calling Gemini twice more', async () => {
    const store = new Map<string, string>()
    const redis = { get: vi.fn(async (k: string) => store.get(k) ?? null), set: vi.fn(async (k: string, v: string) => void store.set(k, v)) }
    const seeds = { en: ['budget 2026'], romanUrdu: [], ur: [] }
    const plan = { primaryKeyword: 'budget 2026', secondaryKeywords: [], urduKeywords: [], romanUrduQueries: [], faqQuestions: [], titleAngle: 'a', searchIntent: 'news' }
    const chat = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(seeds) }).mockResolvedValueOnce({ content: JSON.stringify(plan) })
    const payload = { titleCheck: vi.fn().mockResolvedValue(null) }
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(['budget', ['budget 2026 pakistan']]), { status: 200 }))
    const cluster = { id: '9', headline: 'Budget', items: [{ title: 'Budget passed', url: 'https://x', source: { name: 'Dawn', trustTier: 1 } }] }
    const deps = { router: { chat }, payload, redis, fetchFn } as never
    const first = await researchSeo(cluster as never, deps)
    const second = await researchSeo(cluster as never, deps)
    expect(first?.plan.primaryKeyword).toBe('budget 2026')
    expect(second).toEqual(first)
    expect(chat).toHaveBeenCalledTimes(2) // 2 calls for the first plan, none for the second
  })
})
