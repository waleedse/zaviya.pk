import { describe, expect, it } from 'vitest'
import { pickStories, pickTopic, sameStory, type Candidate } from './select'

const NOW = Date.parse('2026-10-17T00:00:00Z')
const c = (id: number, category: string, hoursAgo: number, title = `Unique story ${id} alpha${id} beta${id} gamma${id}`, over: Partial<Candidate> = {}): Candidate => ({
  id,
  title,
  category,
  priority: 'normal',
  publishedAt: new Date(NOW - hoursAgo * 3600_000).toISOString(),
  hasImage: true,
  ...over,
})

describe('sameStory', () => {
  it('matches overlapping titles', () => {
    expect(sameStory('Pakistan aims for $8bn mineral exports', 'Pakistan targets $8bn mineral exports, ICMA says')).toBe(true)
  })
  it('does not match different stories', () => {
    expect(sameStory('Rupee gains against dollar', 'Lahore smog worsens again')).toBe(false)
  })
})

describe('pickStories', () => {
  it('ranks priority first, requires an image, and honours the window', () => {
    const all = [c(1, 'pakistan', 1), c(2, 'world', 2, undefined, { priority: 'high' }), c(3, 'business', 3, undefined, { hasImage: false }), c(4, 'cricket', 30)]
    expect(pickStories(all, { windowHours: 14, limit: 5 }).map((x) => x.id)).toEqual([2, 1])
  })
  it('caps per category', () => {
    const all = [1, 2, 3, 4].map((i) => c(i, 'pakistan', i))
    expect(pickStories(all, { windowHours: 14, limit: 6, caps: { default: 2 } })).toHaveLength(2)
    expect(pickStories(all, { windowHours: 14, limit: 6, caps: { default: 1, pakistan: 3 } })).toHaveLength(3)
  })
  it('dedupes the same story', () => {
    const all = [c(1, 'pakistan', 1, 'Pakistan aims for $8bn mineral exports'), c(2, 'business', 2, 'Pakistan targets $8bn mineral exports')]
    expect(pickStories(all, { windowHours: 14, limit: 5 })).toHaveLength(1)
  })
  it('excludes used stories first and tops up with them', () => {
    const all = [1, 2, 3].map((i) => c(i, ['pakistan', 'world', 'business'][i - 1]!, i))
    expect(pickStories(all, { windowHours: 14, limit: 2, exclude: new Set([1]) }).map((x) => x.id)).toEqual([2, 3])
    expect(pickStories(all, { windowHours: 14, limit: 3, exclude: new Set([1]) }).map((x) => x.id)).toEqual([2, 3, 1])
  })
})

describe('pickTopic', () => {
  it('ai-tech takes only ai and tech-telecom from the last 96 h', () => {
    const all = [
      ...[1, 2, 3].map((i) => c(i, 'ai', i * 20)),
      ...[4, 5, 6].map((i) => c(i, 'tech-telecom', i * 10)),
      c(7, 'pakistan', 1),
      c(8, 'ai', 150),
    ]
    const got = pickTopic(all, 'ai-tech').map((x) => x.id)
    expect(got.sort()).toEqual([1, 2, 3, 4, 5, 6].filter((i) => i !== 0).sort())
    expect(got).not.toContain(7)
    expect(got).not.toContain(8)
  })
  it('extends to 168 h with fewer than five stories', () => {
    const all = [c(1, 'ai', 1), c(2, 'ai', 50), c(3, 'tech-telecom', 100), c(4, 'tech-telecom', 120), c(5, 'ai', 160), c(6, 'pakistan', 1)]
    // newest is 1 h ago: the 168 h window reaches 5 stories
    const got = pickTopic(all, 'ai-tech')
    expect(got).toHaveLength(5)
  })
  it('money is business only within 12 h', () => {
    const all = [c(1, 'business', 1), c(2, 'business', 5), c(3, 'business', 20), c(4, 'world', 1)]
    expect(pickTopic(all, 'money').map((x) => x.id).sort()).toEqual([1, 2])
  })
})
