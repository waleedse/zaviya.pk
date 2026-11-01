/**
 * The explainer backlog: ideas found every round, ranked, kept for later rounds, steered by the editor.
 * Pure scoring and picking (tested); the Redis store is a thin layer.
 */
import { createHash } from 'node:crypto'
import { EVERGREEN } from './evergreen.js'

export type Risk = 'low' | 'needs-veto'
export type Decision = 'boost' | 'ok' | 'veto'
export type Origin = 'article' | 'trend' | 'evergreen' | 'editor'

export interface Idea {
  id: string
  title: string
  angle: string
  origin: Origin
  articleId?: number
  /** pages the research step reads (empty for evergreen: general knowledge only) */
  sources: string[]
  tags: string[]
  baseScore: number
  createdAt: number
  /** when the news hook ends; undefined = evergreen */
  hookUntil?: number
  risk: Risk
  status: 'backlog' | 'made' | 'expired'
  decision?: Decision
  note?: string
  madeAt?: number
  /** rounds that failed on this idea (script or pictures); two failures retire it */
  failures?: number
}

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

const SENSITIVE =
  /\b(terror\w*|blast|bomb\w*|killed|kills?|dead|death|martyr\w*|murder\w*|rape\w*|harass\w*|abduct\w*|kidnap\w*|massacre|shooting|attack\w*|militan\w*|court|verdict|convict\w*|acquit\w*|arrest\w*|accused|bail|blasphem\w*|sectarian|election\w*|rigging|ISPR|army|military|PTI|PMLN|PML-N|PPP|Imran|Nawaz|Sharif|Zardari|Bilawal|protest\w*|riot\w*|war|ceasefire|strike on|missile|drone|minister\w*|cabinet|parliament\w*|senat\w*|assembly|governor|president|premier|diplomat\w*|summit|delegation|envoy|opposition|coalition|ruling|treaty|sanction\w*)\b/i

/**
 * Government and public-administration topics are never made (Waleed, 24 Oct): ministers, budgets, taxes, courts, regulators, the
 * IMF, public jobs and the like. Unlike SENSITIVE, an editor's ok or boost does not lift this.
 */
const GOVERNMENT =
  /\b(govt|government\w*|minister\w*|ministry|cabinet|parliament\w*|senat\w*|assembly|governor|president|premier|prime minister|PM|federal|provincial|budget|tax(?:es|ation)?|FBR|SBP|State Bank|OGRA|NEPRA|PTA|NADRA|policy|policies|ordinance|laws?|court\w*|supreme|judge\w*|election\w*|ECP|IMF|World Bank|subsid\w*|privati[sz]\w*|DISCOs?|regulator\w*|authority|commission|PPSC|FPSC|NTS|vacanc\w*|scholarship\w*|levy|levies|duty|duties|tariff\w*|army|military|ISPR|police|FIA|NAB|PML-?N|PTI|PPP|visas?|immigra\w+|passports?|embass\w+|consulate|residency|work permit|merit list|admissions?|HED|HEC|department|board|bureau|council|ministerial|public sector|civil servants?|pension\w*|salary increase|bill passed|IRIS|KTBA|customs|import duty|export policy)\b/i
// laws named like "Companies Act 2017": a capitalised word before "Act"
const NAMED_ACT = /\b[A-Z][a-z]+ Act\b|\bAct,? \d{4}\b/

export function isGovernment(text: string): boolean {
  return GOVERNMENT.test(text) || NAMED_ACT.test(text)
}

export function isSensitive(text: string): boolean {
  return SENSITIVE.test(text)
}

// Pakistani viewers watch what is about them: places, money in rupees, our cricket, daily-life costs.
// Foreign gadget and AI-lab news got zero views in Oct 2026, so these ideas rank first.
const PAKISTAN = /\b(pakistan\w*|lahore|karachi|islamabad|rawalpindi|peshawar|quetta|multan|faisalabad|punjab|sindh|balochistan|khyber|kp|gilgit|azad kashmir|rs\.?|rupees?|pkr|psx|petrol|diesel|load ?shedding|smog|aqi|babar|rizwan|shaheen|fakhar|pcb|psl|pia|jazz|zong|telenor|ufone|easypaisa|jazzcash|daraz|wapda|lesco|k-?electric)\b/i

export function isPakistan(text: string): boolean {
  return PAKISTAN.test(text)
}

export function ideaId(title: string): string {
  const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return createHash('sha1').update(norm).digest('hex').slice(0, 12)
}

const stem = (w: string) => w.replace(/(es|s)$/, '')
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map(stem))

/** Share of the smaller title's words that the other title has too */
export function similar(a: string, b: string): number {
  const x = tokens(a)
  const y = tokens(b)
  if (!x.size || !y.size) return 0
  let hit = 0
  for (const w of x) if (y.has(w)) hit++
  return hit / Math.min(x.size, y.size)
}

/** Higher is better. Excluded ideas (vetoed, expired, made, needs-veto without approval) return -Infinity. */
export function scoreIdea(idea: Idea, now: number): number {
  if (idea.status !== 'backlog' || idea.decision === 'veto') return -Infinity
  if (isGovernment(`${idea.title} ${idea.angle}`)) return -Infinity
  if (idea.hookUntil !== undefined && now > idea.hookUntil) return -Infinity
  if (idea.risk === 'needs-veto' && idea.decision !== 'ok' && idea.decision !== 'boost') return -Infinity
  let s = idea.baseScore
  if (idea.hookUntil !== undefined) {
    // news ideas fade as the hook ages
    const life = Math.max(idea.hookUntil - idea.createdAt, HOUR)
    s += 15 * Math.max(0, (idea.hookUntil - now) / life)
  } else {
    // evergreen ideas that keep waiting creep upward, so a good one is not starved forever
    s += Math.min(10, (now - idea.createdAt) / DAY)
  }
  // a round that failed on this idea moves it back, so the next round tries another one
  s -= (idea.failures ?? 0) * 25
  if (isPakistan(`${idea.title} ${idea.angle}`)) s += 30
  if (idea.decision === 'boost') s += 40
  if (idea.decision === 'ok') s += 10
  return s
}

export function rank(ideas: Idea[], now: number): { idea: Idea; score: number }[] {
  return ideas
    .map((idea) => ({ idea, score: scoreIdea(idea, now) }))
    .filter((r) => Number.isFinite(r.score))
    .sort((a, b) => b.score - a.score)
}

/** The best idea that is not too close to a video made in the last 14 days. */
export function pickIdea(ideas: Idea[], now: number, madeTitles: string[]): Idea | null {
  for (const { idea } of rank(ideas, now)) {
    if (madeTitles.some((t) => similar(t, idea.title) >= 0.7)) continue
    return idea
  }
  return null
}

// ---- discovery -------------------------------------------------------------------------------

export interface DiscoverArticle {
  id: number
  title: string
  dek?: string | null
  category: string
  priority: string
  isBreaking?: boolean
  publishedAt: string
  url: string
  tags?: string[]
}

/** Categories where an explainer can come from the news: technology, AI, business, cricket and world stories (anything about government or violence is filtered out by words). */
export const EXPLAINABLE = new Set(['business', 'tech-telecom', 'ai', 'cricket', 'world'])

export function discoverIdeas(input: { articles: DiscoverArticle[]; trends: string[]; now: number }): Idea[] {
  const { articles, trends, now } = input
  const out = new Map<string, Idea>()
  const add = (i: Idea) => {
    const prev = out.get(i.id)
    if (!prev || i.baseScore > prev.baseScore) out.set(i.id, i)
  }

  // 1. stories of the last 36 h worth explaining
  for (const a of articles) {
    const age = now - Date.parse(a.publishedAt)
    if (!(age >= 0 && age <= 36 * HOUR) || !EXPLAINABLE.has(a.category) || a.isBreaking) continue
    const text = `${a.title} ${a.dek ?? ''}`
    if (isGovernment(text)) continue
    const trending = trends.some((t) => t.trim().length >= 4 && similar(t, a.title) >= 0.6)
    add({
      id: ideaId(a.title),
      title: a.title,
      angle: a.dek?.trim() || a.title,
      origin: trending ? 'trend' : 'article',
      articleId: a.id,
      sources: [a.url],
      tags: (a.tags ?? []).slice(0, 4),
      baseScore: (trending ? 34 : 12) + (a.priority === 'high' ? 8 : 0),
      createdAt: now,
      hookUntil: Date.parse(a.publishedAt) + 36 * HOUR,
      risk: isSensitive(text) ? 'needs-veto' : 'low',
      status: 'backlog',
    })
  }

  // 2. evergreen topics
  for (const s of EVERGREEN) {
    add({ id: ideaId(s.title), title: s.title, angle: s.angle, origin: 'evergreen', sources: [], tags: s.tags, baseScore: 16, createdAt: now, risk: 'low', status: 'backlog' })
  }
  return [...out.values()]
}

// ---- store -----------------------------------------------------------------------------------

export interface IdeaRedis {
  hgetall(key: string): Promise<Record<string, string>>
  hset(key: string, field: string, value: string): Promise<unknown>
  hdel(key: string, field: string): Promise<unknown>
}

const KEY = 'explainer:ideas'

export class IdeaStore {
  constructor(private redis: IdeaRedis) {}

  async all(): Promise<Idea[]> {
    const raw = await this.redis.hgetall(KEY)
    return Object.values(raw).map((v) => JSON.parse(v) as Idea)
  }

  async get(id: string): Promise<Idea | null> {
    const raw = await this.redis.hgetall(KEY)
    return raw[id] ? (JSON.parse(raw[id]) as Idea) : null
  }

  async put(idea: Idea): Promise<void> {
    await this.redis.hset(KEY, idea.id, JSON.stringify(idea))
  }

  /** Adds new ideas, refreshes the score of known ones, never touches a decision, status or note. */
  async merge(found: Idea[]): Promise<void> {
    const have = new Map((await this.all()).map((i) => [i.id, i]))
    for (const f of found) {
      const old = have.get(f.id)
      if (!old) await this.put(f)
      else if (old.status === 'backlog') await this.put({ ...old, baseScore: Math.max(old.baseScore, f.baseScore), hookUntil: f.hookUntil ?? old.hookUntil, sources: old.sources.length ? old.sources : f.sources })
    }
  }

  async decide(id: string, decision: Decision, note?: string): Promise<Idea | null> {
    const idea = await this.get(id)
    if (!idea) return null
    const next = { ...idea, decision, ...(note ? { note: note.slice(0, 300) } : {}) }
    await this.put(next)
    return next
  }

  async markMade(id: string, now: number): Promise<void> {
    const idea = await this.get(id)
    if (idea) await this.put({ ...idea, status: 'made', madeAt: now })
  }

  /** Drops ideas whose hook ended long ago and made ideas older than 30 days. */
  async prune(now: number): Promise<number> {
    let n = 0
    for (const i of await this.all()) {
      const dead = (i.hookUntil !== undefined && now > i.hookUntil + 2 * DAY) || (i.status === 'made' && now - (i.madeAt ?? 0) > 30 * DAY)
      if (dead) {
        await this.redis.hdel(KEY, i.id)
        n++
      }
    }
    return n
  }

  async madeTitles(now: number, days = 14): Promise<string[]> {
    return (await this.all()).filter((i) => i.status === 'made' && now - (i.madeAt ?? 0) < days * DAY).map((i) => i.title)
  }
}

export function memoryIdeaRedis(): IdeaRedis {
  const h = new Map<string, Map<string, string>>()
  const m = (k: string) => h.get(k) ?? (h.set(k, new Map()), h.get(k)!)
  return {
    hgetall: async (k) => Object.fromEntries(m(k)),
    hset: async (k, f, v) => void m(k).set(f, v),
    hdel: async (k, f) => void m(k).delete(f),
  }
}
