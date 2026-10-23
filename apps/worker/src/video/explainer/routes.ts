/** The explainer backlog over HTTP for the editor agent (and for Waleed): list, add, decide, and make one now. */
import { z } from 'zod'
import type { ExtraRoutes } from '../media-hub.js'
import { HOUR, ideaId, isSensitive, rank, type Idea, IdeaStore } from './ideas.js'

const AddSchema = z.object({
  title: z.string().min(8).max(160),
  angle: z.string().min(8).max(300),
  sources: z.array(z.string().url()).max(4).default([]),
  tags: z.array(z.string()).max(4).default([]),
  hours: z.number().min(1).max(72).optional(),
})
const DecideSchema = z.object({ decision: z.enum(['boost', 'ok', 'veto']), note: z.string().max(300).optional() })
const RunSchema = z.object({ ideaId: z.string().optional(), dry: z.boolean().optional(), now: z.boolean().optional() })

export function explainerRoutes(store: IdeaStore, now: () => number, runNow: (o: z.infer<typeof RunSchema>) => Promise<void>): ExtraRoutes {
  return async (method, pathname, body) => {
    if (method === 'GET' && pathname === '/ideas') {
      const t = now()
      const ranked = rank(await store.all(), t).slice(0, 30)
      return {
        status: 200,
        body: ranked.map(({ idea, score }) => ({
          id: idea.id,
          title: idea.title,
          angle: idea.angle,
          origin: idea.origin,
          risk: idea.risk,
          score: Math.round(score),
          decision: idea.decision ?? null,
          note: idea.note ?? null,
          hoursLeft: idea.hookUntil ? Math.max(0, Math.round((idea.hookUntil - t) / HOUR)) : null,
          sources: idea.sources,
        })),
      }
    }
    if (method === 'POST' && pathname === '/ideas') {
      const p = AddSchema.safeParse(body)
      if (!p.success) return { status: 400, body: { error: p.error.issues[0]?.message ?? 'invalid' } }
      const t = now()
      const idea: Idea = {
        id: ideaId(p.data.title),
        title: p.data.title,
        angle: p.data.angle,
        origin: 'editor',
        sources: p.data.sources,
        tags: p.data.tags,
        baseScore: 30,
        createdAt: t,
        ...(p.data.hours ? { hookUntil: t + p.data.hours * HOUR } : {}),
        risk: isSensitive(`${p.data.title} ${p.data.angle}`) ? 'needs-veto' : 'low',
        status: 'backlog',
      }
      await store.put(idea)
      return { status: 200, body: { id: idea.id, risk: idea.risk } }
    }
    const m = /^\/ideas\/([a-f0-9]{6,12})$/.exec(pathname)
    if (method === 'POST' && m) {
      const p = DecideSchema.safeParse(body)
      if (!p.success) return { status: 400, body: { error: p.error.issues[0]?.message ?? 'invalid' } }
      const idea = await store.decide(m[1]!, p.data.decision, p.data.note)
      return idea ? { status: 200, body: { id: idea.id, decision: idea.decision } } : { status: 404, body: { error: 'no such idea' } }
    }
    if (method === 'POST' && pathname === '/explainer/run') {
      const p = RunSchema.safeParse(body)
      if (!p.success) return { status: 400, body: { error: 'invalid' } }
      await runNow(p.data)
      return { status: 202, body: { queued: true } }
    }
    return null
  }
}
