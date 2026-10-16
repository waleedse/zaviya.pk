/**
 * The editor's front-page plan: which story leads, which stories sit where and until when, which
 * stories stay off the homepage and the order of the sections. The editor agent writes it through
 * `PATCH /api/globals/front-page`; the homepage follows it and fills any empty slot itself.
 */

export const FRONT_SECTIONS = ['pakistan', 'money', 'namaz', 'world-cricket', 'tech-ai', 'jobs', 'stories', 'more'] as const
export type FrontSection = (typeof FRONT_SECTIONS)[number]

/** Sections that take pinned stories, and the categories each one is filled from. */
export const SECTION_CATEGORIES = {
  pakistan: ['pakistan'],
  money: ['business', 'autos'],
  world: ['world'],
  cricket: ['cricket'],
  'tech-ai': ['tech-telecom', 'ai'],
  jobs: ['education-jobs'],
} as const
export type PinSection = keyof typeof SECTION_CATEGORIES
export const PIN_SECTIONS = Object.keys(SECTION_CATEGORIES) as PinSection[]

export interface PlanSlot {
  id: number
  /** ISO time after which the slot is ignored and the story goes back to the automatic flow */
  until?: string
}

export interface FrontPagePlan {
  lead?: PlanSlot
  seconds?: PlanSlot[]
  pins?: Partial<Record<PinSection, PlanSlot[]>>
  hidden?: number[]
  order?: FrontSection[]
}

function slot(v: unknown, where: string): PlanSlot {
  if (typeof v === 'number') return { id: v }
  if (!v || typeof v !== 'object') throw new Error(`${where}: expected {"id": <article id>, "until"?: <ISO time>}`)
  const { id, until } = v as Record<string, unknown>
  if (typeof id !== 'number' || !Number.isInteger(id)) throw new Error(`${where}.id must be an article id (number)`)
  if (until !== undefined && (typeof until !== 'string' || Number.isNaN(Date.parse(until)))) throw new Error(`${where}.until must be an ISO time`)
  return until ? { id, until } : { id }
}

/** Checks a plan written by the editor; throws a message the agent can act on. */
export function parsePlan(raw: unknown): FrontPagePlan {
  if (raw == null || raw === '') return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('plan must be an object')
  const r = raw as Record<string, unknown>
  const plan: FrontPagePlan = {}
  if (r.lead != null) plan.lead = slot(r.lead, 'lead')
  if (r.seconds != null) {
    if (!Array.isArray(r.seconds) || r.seconds.length > 4) throw new Error('seconds must be a list of up to 4 slots')
    plan.seconds = r.seconds.map((s, i) => slot(s, `seconds[${i}]`))
  }
  if (r.pins != null) {
    if (typeof r.pins !== 'object' || Array.isArray(r.pins)) throw new Error(`pins must be an object keyed by section: ${PIN_SECTIONS.join(', ')}`)
    plan.pins = {}
    for (const [key, list] of Object.entries(r.pins as Record<string, unknown>)) {
      if (!PIN_SECTIONS.includes(key as PinSection)) throw new Error(`pins.${key}: unknown section (use ${PIN_SECTIONS.join(', ')})`)
      if (!Array.isArray(list) || list.length > 4) throw new Error(`pins.${key} must be a list of up to 4 slots`)
      plan.pins[key as PinSection] = list.map((s, i) => slot(s, `pins.${key}[${i}]`))
    }
  }
  if (r.hidden != null) {
    if (!Array.isArray(r.hidden) || !r.hidden.every((id) => Number.isInteger(id))) throw new Error('hidden must be a list of article ids')
    plan.hidden = r.hidden as number[]
  }
  if (r.order != null) {
    if (!Array.isArray(r.order) || !r.order.every((s) => FRONT_SECTIONS.includes(s as FrontSection))) {
      throw new Error(`order must list sections from: ${FRONT_SECTIONS.join(', ')}`)
    }
    plan.order = [...new Set(r.order as FrontSection[])]
  }
  return plan
}

/** A pinned lead older than this goes back to the automatic flow, whatever `until` says. */
export const LEAD_MAX_AGE_MS = 8 * 3600e3

const STOP = new Set(
  'a an the of in on at to for and or as by with from after over into amid says say said new its it is are was were be has have had will than that this their his her after before about near during against more most up down out off not no per vs'.split(' '),
)

function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/**
 * Two headlines about the same event, written by two pipeline runs ("Hospital says 32 students died
 * in the Peshawar school collapse" / "Peshawar school collapse: toll reaches 33"). Compares the
 * meaningful words: enough overlap relative to the shorter headline means the same story.
 */
export function sameStory(a: string, b: string): boolean {
  const ta = tokens(a)
  const tb = tokens(b)
  const small = Math.min(ta.size, tb.size)
  if (small < 3) return false
  let shared = 0
  for (const w of ta) if (tb.has(w)) shared++
  return shared >= 3 && shared / small >= 0.6
}

export function isActive(s: PlanSlot | undefined, now = Date.now()): s is PlanSlot {
  return Boolean(s) && (!s!.until || Date.parse(s!.until) > now)
}

/** The editor's order first, then any section it left out, in the default order. */
export function sectionOrder(plan: FrontPagePlan): FrontSection[] {
  const order = plan.order ?? []
  return [...order, ...FRONT_SECTIONS.filter((s) => !order.includes(s))]
}
