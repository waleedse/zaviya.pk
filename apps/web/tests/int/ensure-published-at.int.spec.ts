import { describe, expect, it } from 'vitest'
import { ensurePublishedAt } from '@/hooks/articles'

const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
  (ensurePublishedAt as unknown as (a: unknown) => Record<string, unknown>)({ data, originalDoc })

describe('ensurePublishedAt', () => {
  it('stamps a published article that has no date', () => {
    expect(run({ _status: 'published' }).publishedAt).toBeTruthy()
  })
  it('keeps an existing date and ignores drafts', () => {
    expect(run({ _status: 'published', publishedAt: '2026-10-01T00:00:00.000Z' }).publishedAt).toBe('2026-10-01T00:00:00.000Z')
    expect(run({ _status: 'published' }, { publishedAt: '2026-10-01T00:00:00.000Z' }).publishedAt).toBeUndefined()
    expect(run({ _status: 'draft' }).publishedAt).toBeUndefined()
  })
})
