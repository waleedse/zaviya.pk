import { describe, expect, it, vi } from 'vitest'
import { IdeaStore, ideaId, memoryIdeaRedis, type Idea } from './ideas.js'
import { explainerRoutes } from './routes.js'

const NOW = Date.UTC(2026, 9, 24, 8)
const idea = (title: string, over: Partial<Idea> = {}): Idea => ({ id: ideaId(title), title, angle: 'a', origin: 'article', sources: [], tags: [], baseScore: 20, createdAt: NOW, risk: 'low', status: 'backlog', ...over })

describe('explainer routes', () => {
  it('lists needs-veto ideas (flagged) for the editor, hides vetoed and made ones', async () => {
    const store = new IdeaStore(memoryIdeaRedis())
    await store.put(idea('A calm topic about solar panels'))
    await store.put(idea('A political topic about ministers', { risk: 'needs-veto', baseScore: 30 }))
    await store.put(idea('A vetoed topic about batteries', { decision: 'veto' }))
    await store.put(idea('A made topic about rockets', { status: 'made' }))
    const routes = explainerRoutes(store, () => NOW, vi.fn())
    const res = await routes('GET', '/ideas', {})
    const list = res!.body as { title: string; risk: string }[]
    expect(list.map((i) => i.title)).toEqual(['A political topic about ministers', 'A calm topic about solar panels'])
    expect(list[0]!.risk).toBe('needs-veto')
  })

  it('adds an idea (sensitive ones are flagged), decides on it, and queues a run', async () => {
    const store = new IdeaStore(memoryIdeaRedis())
    const run = vi.fn(async () => {})
    const routes = explainerRoutes(store, () => NOW, run)
    const added = await routes('POST', '/ideas', { title: 'How the court system works explained', angle: 'a long enough angle for the schema' })
    expect((added!.body as { risk: string }).risk).toBe('needs-veto')
    const id = (added!.body as { id: string }).id
    expect((await routes('POST', `/ideas/${id}`, { decision: 'ok', note: 'neutral, primary source' }))!.status).toBe(200)
    expect((await store.get(id))?.decision).toBe('ok')
    expect((await routes('POST', '/ideas/ffffffffffff', { decision: 'ok' }))!.status).toBe(404)
    expect((await routes('POST', '/explainer/run', { dry: true }))!.status).toBe(202)
    expect(run).toHaveBeenCalledWith({ dry: true })
    expect(await routes('GET', '/nothing', {})).toBeNull()
  })
})
