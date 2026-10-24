import { describe, expect, it } from 'vitest'
import { DAY, discoverIdeas, HOUR, IdeaStore, ideaId, isSensitive, memoryIdeaRedis, pickIdea, rank, scoreIdea, similar, type Idea } from './ideas.js'

const NOW = Date.UTC(2026, 9, 24, 8)
const idea = (over: Partial<Idea> = {}): Idea => ({ id: ideaId(over.title ?? 'x'), title: 'Some topic about rockets', angle: 'a', origin: 'evergreen', sources: [], tags: [], baseScore: 16, createdAt: NOW, risk: 'low', status: 'backlog', ...over })
const article = (over: Record<string, unknown> = {}) => ({ id: 1, title: 'Starlink opens satellite internet bookings', category: 'tech-telecom', priority: 'normal', publishedAt: new Date(NOW - 2 * HOUR).toISOString(), url: 'https://zaviya.pk/tech-telecom/x', ...over }) as never

describe('scoring', () => {
  it('excludes vetoed, expired, made and unapproved sensitive ideas', () => {
    expect(scoreIdea(idea({ decision: 'veto' }), NOW)).toBe(-Infinity)
    expect(scoreIdea(idea({ hookUntil: NOW - 1 }), NOW)).toBe(-Infinity)
    expect(scoreIdea(idea({ status: 'made' }), NOW)).toBe(-Infinity)
    expect(scoreIdea(idea({ risk: 'needs-veto' }), NOW)).toBe(-Infinity)
    expect(scoreIdea(idea({ risk: 'needs-veto', decision: 'ok' }), NOW)).toBeGreaterThan(0)
  })

  it('lets the editor boost and lets waiting evergreen ideas creep up', () => {
    expect(scoreIdea(idea({ decision: 'boost' }), NOW)).toBeGreaterThan(scoreIdea(idea(), NOW) + 30)
    expect(scoreIdea(idea({ createdAt: NOW - 5 * DAY }), NOW)).toBeGreaterThan(scoreIdea(idea(), NOW))
  })

  it('moves an idea back after a failed round', () => {
    expect(scoreIdea(idea({ failures: 1 }), NOW)).toBeLessThan(scoreIdea(idea(), NOW) - 20)
  })

  it('fades a news idea as its hook ages', () => {
    const fresh = idea({ hookUntil: NOW + 30 * HOUR, createdAt: NOW - HOUR })
    const old = idea({ hookUntil: NOW + 2 * HOUR, createdAt: NOW - 34 * HOUR })
    expect(scoreIdea(fresh, NOW)).toBeGreaterThan(scoreIdea(old, NOW))
  })
})

describe('picking', () => {
  it('takes the best idea that is not a repeat of a recent video', () => {
    const a = idea({ title: 'How rockets reach orbit around Earth', decision: 'boost' })
    const b = idea({ title: 'How solar panels make electricity', id: ideaId('b') })
    expect(pickIdea([a, b], NOW, [])?.title).toBe(a.title)
    expect(pickIdea([a, b], NOW, ['How a rocket reaches orbit around the Earth'])?.title).toBe(b.title)
    expect(pickIdea([a], NOW, ['How rockets reach orbit around Earth'])).toBeNull()
  })
})

describe('discovery', () => {
  it('keeps explainable stories, marks sensitive ones, skips breaking and old ones, and adds evergreen topics', () => {
    const found = discoverIdeas({
      articles: [
        article(),
        article({ id: 2, title: 'Blast kills three near market', category: 'pakistan' }),
        article({ id: 3, title: 'Court verdict on tax case', category: 'business' }),
        article({ id: 4, title: 'Old story about chips', publishedAt: new Date(NOW - 50 * HOUR).toISOString() }),
        article({ id: 5, title: 'Big AI model launched', category: 'ai', isBreaking: true }),
        article({ id: 6, title: 'Foreign affairs update from abroad', category: 'world' }),
      ],
      trends: ['Starlink'],
      now: NOW,
    })
    const byArticle = (id: number) => found.find((i) => i.articleId === id)
    expect(byArticle(1)?.origin).toBe('trend')
    expect(byArticle(1)?.risk).toBe('low')
    expect(byArticle(2)).toBeUndefined()
    expect(byArticle(3)?.risk).toBe('needs-veto')
    expect(byArticle(4)).toBeUndefined()
    expect(byArticle(5)).toBeUndefined()
    expect(byArticle(6)).toBeUndefined()
    expect(found.filter((i) => i.origin === 'evergreen').length).toBeGreaterThan(20)
  })

  it('detects sensitive words', () => {
    expect(isSensitive('Ishaq Dar departs for Istanbul to attend R4 ministers talks')).toBe(true)
    expect(isSensitive('Imran Khan court hearing')).toBe(true)
    expect(isSensitive('How solar panels work')).toBe(false)
    expect(similar('How rockets reach orbit', 'How a rocket reaches orbit')).toBeGreaterThan(0.5)
  })
})

describe('IdeaStore', () => {
  it('merges without touching decisions, decides, marks made and prunes', async () => {
    const store = new IdeaStore(memoryIdeaRedis())
    const a = idea({ title: 'How rockets reach orbit around Earth' })
    await store.merge([a])
    await store.decide(a.id, 'boost', 'good one')
    await store.merge([{ ...a, baseScore: 99 }])
    const got = await store.get(a.id)
    expect(got?.decision).toBe('boost')
    expect(got?.baseScore).toBe(99)
    await store.markMade(a.id, NOW)
    expect(await store.madeTitles(NOW + DAY)).toEqual([a.title])
    expect(rank(await store.all(), NOW)).toEqual([])
    const old = idea({ title: 'Old news topic here', hookUntil: NOW - 3 * DAY })
    await store.put(old)
    expect(await store.prune(NOW)).toBe(1)
  })
})
