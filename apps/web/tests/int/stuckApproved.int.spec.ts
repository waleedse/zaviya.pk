import { describe, expect, it } from 'vitest'
import { STUCK_MAX_PAGES, STUCK_RESULT_LIMIT, collectStuckApproved, isStuckApproved } from '../../src/lib/stuck-approved'

const now = Date.parse('2026-10-25T04:00:00Z')
const ago = (min: number) => new Date(now - min * 60_000).toISOString()

describe('isStuckApproved (ZAV-107)', () => {
  it('an editor-approved cluster writing for over 45 minutes is stuck', () => {
    expect(isStuckApproved({ id: 12349, status: 'writing', updatedAt: ago(180), triage: { editorApproved: true } }, now, 45, 30)).toBe(true)
  })
  it('a young write or an unapproved writing cluster is not', () => {
    expect(isStuckApproved({ id: 1, status: 'writing', updatedAt: ago(10), triage: { editorApproved: true } }, now, 45, 30)).toBe(false)
    expect(isStuckApproved({ id: 2, status: 'writing', updatedAt: ago(900), triage: {} }, now, 45, 30)).toBe(false)
  })
  it('ZAV-261: an approved cluster with releaseCount 0 is stuck once idle for the writing age (15)', () => {
    expect(isStuckApproved({ id: 18312, status: 'writing', updatedAt: ago(20), triage: { editorApproved: true, releaseCount: 0 } }, now, 15, 30)).toBe(true)
    expect(isStuckApproved({ id: 18312, status: 'writing', updatedAt: ago(10), triage: { editorApproved: true, releaseCount: 0 } }, now, 15, 30)).toBe(false)
  })
  it('ZAV-259: a recent writing cluster with triage null is stuck; an ancient one is not', () => {
    expect(isStuckApproved({ id: 18718, status: 'writing', updatedAt: ago(60), triage: null }, now, 15, 30)).toBe(true)
    expect(isStuckApproved({ id: 18718, status: 'writing', updatedAt: ago(5), triage: null }, now, 15, 30)).toBe(false)
    expect(isStuckApproved({ id: 18718, status: 'writing', updatedAt: ago(400), triage: null }, now, 15, 30)).toBe(false)
  })
  it('a plain publish decision waits for the publish idle time', () => {
    expect(isStuckApproved({ id: 3, status: 'triaged', updatedAt: ago(20), triage: { codeOutcome: 'publish' } }, now, 45, 30)).toBe(false)
    expect(isStuckApproved({ id: 3, status: 'triaged', updatedAt: ago(40), triage: { codeOutcome: 'publish' } }, now, 45, 30)).toBe(true)
  })
})

describe('collectStuckApproved (ZAV-203)', () => {
  const page = (docs: Array<{ id: number; status: string; updatedAt: string; triage: object }>, size: number) => async (n: number) => ({
    docs: docs.slice((n - 1) * size, n * size),
    hasNextPage: n * size < docs.length,
  })

  it('finds approved clusters behind a full page of unapproved writing ones (12349 and 12363)', async () => {
    const noise = Array.from({ length: 700 }, (_, i) => ({ id: i + 1, status: 'writing', updatedAt: ago(5000 - i), triage: {} }))
    const approved = [12349, 12363].map((id) => ({ id, status: 'writing', updatedAt: ago(200), triage: { editorApproved: true } }))
    const got = await collectStuckApproved(page([...noise, ...approved], 300), now, 45, 30)
    expect(got.map((c) => c.id)).toEqual([12349, 12363])
  })

  it('caps the result and stops reading pages', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, status: 'writing', updatedAt: ago(500), triage: { editorApproved: true } }))
    let reads = 0
    const got = await collectStuckApproved(async (n) => (reads++, page(many, 10)(n)), now, 45, 30)
    expect(got).toHaveLength(STUCK_RESULT_LIMIT)
    expect(reads).toBeLessThan(STUCK_MAX_PAGES + 1)
  })
})
