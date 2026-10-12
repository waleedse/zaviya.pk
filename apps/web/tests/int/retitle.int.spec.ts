import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { retitleArticle } from '../../src/lib/learning'

const fakePayload = (opts: { failLearning?: boolean } = {}) => {
  const store = new Map<string, unknown>()
  const created: unknown[] = []
  const payload = {
    findByID: vi.fn(async () => ({ title: 'Old headline', titleVariants: [], seo: { metaDescription: 'd' } })),
    update: vi.fn(async () => ({})),
    create: vi.fn(async (a: unknown) => {
      created.push(a)
      return {}
    }),
    db: {
      drizzle: {
        execute: vi.fn(async (q: { queryChunks?: unknown[] }) => {
          if (opts.failLearning) throw new Error('db down')
          const text = JSON.stringify(q.queryChunks ?? [])
          if (text.includes('INSERT INTO zaviya_learning')) {
            const json = (q.queryChunks ?? []).find((c) => typeof c === 'string' && c.startsWith('{'))
            if (json) store.set('retitled_at', JSON.parse(json as string))
            return { rows: [] }
          }
          return { rows: store.has('retitled_at') ? [{ value: store.get('retitled_at') }] : [] }
        }),
      },
    },
  }
  return { payload: payload as unknown as Payload, raw: payload, store, created }
}

describe('retitleArticle', () => {
  it('updates the title, records retitled_at and writes an audit-log row', async () => {
    const f = fakePayload()
    const res = await retitleArticle(f.payload, '44', 'en', 'A much better headline for this story', 'low CTR')
    expect(res).toEqual({ old: 'Old headline', title: 'A much better headline for this story' })
    expect(f.raw.update).toHaveBeenCalledOnce()
    expect(Object.keys(f.store.get('retitled_at') as object)).toContain('44')
    expect(f.created).toHaveLength(1)
  })

  it('still succeeds when the learning bookkeeping fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const f = fakePayload({ failLearning: true })
    await expect(retitleArticle(f.payload, '44', 'en', 'A much better headline for this story', 'x')).resolves.toMatchObject({ old: 'Old headline' })
    err.mockRestore()
  })
})
