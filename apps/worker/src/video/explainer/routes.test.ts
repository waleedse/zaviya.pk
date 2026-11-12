import { describe, expect, it, vi } from 'vitest'
import { IdeaStore, ideaId, memoryIdeaRedis, scoreIdea, type Idea } from './ideas.js'
import { explainerRoutes } from './routes.js'

const NOW = Date.UTC(2026, 9, 24, 8)
const idea = (title: string, over: Partial<Idea> = {}): Idea => ({ id: ideaId(title), title, angle: 'a', origin: 'article', sources: [], tags: [], baseScore: 20, createdAt: NOW, risk: 'low', status: 'backlog', ...over })

describe('explainer routes', () => {
  it('lists needs-veto ideas (flagged) for the editor, hides vetoed and made ones', async () => {
    const store = new IdeaStore(memoryIdeaRedis())
    await store.put(idea('A calm topic about solar panels'))
    await store.put(idea('A topic about a deadly attack scene', { risk: 'needs-veto', baseScore: 30 }))
    await store.put(idea('A vetoed topic about batteries', { decision: 'veto' }))
    await store.put(idea('A made topic about rockets', { status: 'made' }))
    const routes = explainerRoutes(store, () => NOW, vi.fn())
    const res = await routes('GET', '/ideas', {})
    const list = res!.body as { title: string; risk: string }[]
    expect(list.map((i) => i.title)).toEqual(['A topic about a deadly attack scene', 'A calm topic about solar panels'])
    expect(list[0]!.risk).toBe('needs-veto')
  })

  it('accepts a government topic from the editor without trending (13 Nov); a trending story still needs 2+ sources', async () => {
    const routes = explainerRoutes(new IdeaStore(memoryIdeaRedis()), () => NOW, vi.fn())
    const res = await routes('POST', '/ideas', { title: 'Federal budget explained for beginners', angle: 'what the finance minister announced and why' })
    expect(res!.status).toBe(200)
    const one = await routes('POST', '/ideas', { title: 'How the US midterm election works', angle: 'what changes for the dollar and for Pakistan', trending: true, sources: ['https://example.com/a'] })
    expect(one!.status).toBe(400)
  })

  it('adds a trending war or election story and a party topic with no editor ok needed (13 Nov)', async () => {
    const store = new IdeaStore(memoryIdeaRedis())
    const routes = explainerRoutes(store, () => NOW, vi.fn())
    const sources = ['https://example.com/a', 'https://example.com/b']
    const added = await routes('POST', '/ideas', { title: 'What US-Iran strikes mean for petrol prices in Pakistan', angle: 'how the Hormuz situation reaches the pump price', trending: true, sources, hours: 48 })
    expect(added!.status).toBe(200)
    const id = (added!.body as { id: string }).id
    expect((await store.get(id))).toMatchObject({ trending: true, risk: 'low' })
    const waiting = (await routes('GET', '/ideas', {}))!.body as { title: string; trending: boolean }[]
    expect(waiting.map((i) => i.title)).toContain('What US-Iran strikes mean for petrol prices in Pakistan')
    expect(scoreIdea((await store.get(id))!, NOW)).toBeGreaterThan(0)
    const party = await routes('POST', '/ideas', { title: 'PTI long march explained step by step', angle: 'what the party plans and why it matters', trending: true, sources })
    expect(party!.status).toBe(200)
  })

  it('adds an idea (none is flagged for its topic), decides on it, and queues a run', async () => {
    const store = new IdeaStore(memoryIdeaRedis())
    const run = vi.fn(async () => {})
    const routes = explainerRoutes(store, () => NOW, run)
    const added = await routes('POST', '/ideas', { title: 'How a deadly attack is reported', angle: 'a long enough angle for the schema' })
    expect((added!.body as { risk: string }).risk).toBe('low')
    const id = (added!.body as { id: string }).id
    expect((await routes('POST', `/ideas/${id}`, { decision: 'ok', note: 'neutral, primary source' }))!.status).toBe(200)
    expect((await store.get(id))?.decision).toBe('ok')
    expect((await routes('POST', '/ideas/ffffffffffff', { decision: 'ok' }))!.status).toBe(404)
    expect((await routes('POST', '/explainer/run', { dry: true }))!.status).toBe(202)
    expect(run).toHaveBeenCalledWith({ dry: true })
    expect(await routes('GET', '/nothing', {})).toBeNull()
  })
})
