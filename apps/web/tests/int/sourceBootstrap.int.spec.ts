import { describe, expect, it, vi } from 'vitest'
import { BOOTSTRAP_SOURCES, ensureBootstrapSources } from '../../src/lib/source-bootstrap'
import { SEED_SOURCES } from '../../src/seed/sources'

describe('bootstrap sources', () => {
  it('has unique keys that do not clash with the seed, and https urls', () => {
    const keys = BOOTSTRAP_SOURCES.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(SEED_SOURCES.some((s) => s.key === k)).toBe(false)
    for (const s of BOOTSTRAP_SOURCES) expect(s.url.startsWith('https://')).toBe(true)
  })
  it('creates only the missing ones and never updates', async () => {
    const find = vi.fn(async ({ where }: { where: { key: { equals: string } } }) => ({ docs: where.key.equals === 'bbc-cricket' ? [{ id: 1 }] : [] }))
    const create = vi.fn(async () => ({}))
    const update = vi.fn()
    const made = await ensureBootstrapSources({ find, create, update } as never)
    expect(made).not.toContain('bbc-cricket')
    expect(made).toHaveLength(BOOTSTRAP_SOURCES.length - 1)
    expect(update).not.toHaveBeenCalled()
  })
})
