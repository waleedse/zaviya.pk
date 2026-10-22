import { describe, expect, it } from 'vitest'
import { DUPLICATE_WINDOW_MS, findDuplicate, savedSlug, withKeyLock } from '../../src/lib/publish-guard'

const now = Date.parse('2026-10-21T20:04:40Z')
const ago = (ms: number) => new Date(now - ms).toISOString()

describe('findDuplicate (ZAV-158)', () => {
  it('1476 just published makes a second create for the same cluster a duplicate', () => {
    expect(findDuplicate([{ id: 1476, createdAt: ago(3_000), workflow: 'published' }], now)?.id).toBe(1476)
  })
  it('an article waiting for the editor counts too', () => {
    expect(findDuplicate([{ id: 9, createdAt: ago(60_000), workflow: 'in_review' }], now)?.id).toBe(9)
  })
  it('a rejected draft, a retracted article or an old article does not block a new one', () => {
    expect(findDuplicate([{ id: 1, createdAt: ago(60_000), workflow: 'draft' }], now)).toBeUndefined()
    expect(findDuplicate([{ id: 2, createdAt: ago(60_000), workflow: 'retracted' }], now)).toBeUndefined()
    expect(findDuplicate([{ id: 3, createdAt: ago(DUPLICATE_WINDOW_MS + 1000), workflow: 'published' }], now)).toBeUndefined()
    expect(findDuplicate([], now)).toBeUndefined()
  })
})

describe('withKeyLock', () => {
  it('runs calls with the same key one after another, so check-then-create cannot race', async () => {
    const created: string[] = []
    const publish = (name: string) =>
      withKeyLock('cluster-11509', async () => {
        const already = created.length > 0
        await new Promise((r) => setTimeout(r, 20)) // the create takes a moment
        if (!already) created.push(name)
        return already ? 'deduped' : 'created'
      })
    const results = await Promise.all([publish('first'), publish('second')])
    expect(results).toEqual(['created', 'deduped'])
    expect(created).toEqual(['first'])
  })
  it('different keys do not wait for each other, and a failure does not block the next call', async () => {
    const order: string[] = []
    const slow = withKeyLock('a', async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push('a')
    })
    await withKeyLock('b', async () => void order.push('b'))
    await slow
    expect(order).toEqual(['b', 'a'])
    await expect(withKeyLock('c', async () => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(withKeyLock('c', async () => 'ok')).resolves.toBe('ok')
  })
})

describe('savedSlug', () => {
  it('reads the slug the document already holds, so editing other fields is not blocked by a shared slug', () => {
    expect(savedSlug({ slug: 'walmart-ai-shopping-agents' }, 'en', 'en')).toBe('walmart-ai-shopping-agents')
    expect(savedSlug({ slug: { en: 'a', ur: 'b' } }, 'ur', 'en')).toBe('b')
    expect(savedSlug({ slug: 'a' }, 'ur', 'en')).toBeUndefined()
    expect(savedSlug(undefined, 'en')).toBeUndefined()
  })
})
