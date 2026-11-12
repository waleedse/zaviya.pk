import type { CategorySlug } from '@zaviya/shared'
import { isTrendMarked } from '../ingest/trend-gap-mark.js'
import { majorGlobalTopic } from './global-news.js'

type Item = { title: string; summary?: string | null; publishedAt?: string; source?: { name?: string | null } | null }
type Cluster = { headline?: string; distinctSources: number; items: Item[] }

/**
 * The desk a cluster will most likely land on, from its headlines (the model decides the real one later; this only
 * orders the queue and the 6 h rule, so a rough guess is enough).
 */
export function guessDesk(c: Pick<Cluster, 'headline' | 'items'>): CategorySlug {
  const text = [c.headline, ...c.items.map((i) => i.title)].filter(Boolean).join(' | ')
  if (/\b(cricket|test match|odi|t20|psl|pcb|wickets?|innings|batsman|bowler|asia cup)\b/i.test(text)) return 'cricket'
  if (/\b(ai|artificial intelligence|chatgpt|openai|gemini|claude|llm|deepseek|nvidia)\b/i.test(text)) return 'ai'
  if (/\b(jobs?|vacanc(y|ies)|recruitment|admissions?|scholarships?|results?|date ?sheet|hec|ppsc|fpsc|nts)\b/i.test(text)) return 'education-jobs'
  if (majorGlobalTopic(text)) return 'world'
  const pakistan = /\b(pakistan|pakistani|karachi|lahore|islamabad|rawalpindi|peshawar|quetta|multan|punjab|sindh|balochistan|khyber|kp|nab|ecp|sbp|psx|fbr|ogra|pti|pml|ppp|imran|shehbaz|nawaz|zardari)\b/i
  return pakistan.test(text) ? 'pakistan' : 'world'
}

/** Learned desk weight (Settings.categoryWeights); neutral 1 when nothing was learned. */
export function deskWeight(desk: string, weights?: Record<string, number> | null): number {
  return weights?.[desk] ?? 1
}

/** Desks at or below this weight (world, ai, cricket: 0.6) are the first to be closed by rule when they wait too long. */
export const LOW_DESK_WEIGHT = 0.6
/** A lone, low-desk, non-trending cluster still untriaged after this long is closed by rule: no model call. */
export const LONE_LOW_DESK_CLOSE_MS = 6 * 3_600_000

function oldestMs(items: { publishedAt?: string }[]): number {
  const t = items.map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : NaN)).filter(Number.isFinite)
  return t.length ? Math.min(...t) : 0
}

function newestMs(items: { publishedAt?: string }[]): number {
  const t = items.map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : NaN)).filter(Number.isFinite)
  return t.length ? Math.max(...t) : 0
}

/**
 * BullMQ priority for a triage job (lower runs first), so the limited Gemini quota goes to the best clusters first:
 * trend hit, then two or more outlets, then the learned desk weight, then recency (fresher first). Jobs that other
 * flows add at priority 1-2 (editor, trend-gap nudge) stay ahead of all of these.
 */
export function triagePriority(c: Cluster, o: { weights?: Record<string, number> | null; now?: number } = {}): number {
  const now = o.now ?? Date.now()
  let tier: number
  if (isTrendMarked(c.items)) tier = 3
  else {
    const w = deskWeight(guessDesk(c), o.weights)
    const outlets = c.distinctSources >= 2
    tier = outlets ? (w >= 1 ? 4 : w > LOW_DESK_WEIGHT ? 5 : 6) : w > LOW_DESK_WEIGHT ? 7 : 8
  }
  const newest = newestMs(c.items)
  const ageH = newest ? Math.max(0, (now - newest) / 3_600_000) : 9
  return tier * 10 + Math.min(9, Math.floor(ageH / 2))
}

/** The priority for flows that have no cluster in hand (sweeps): after trending and multi-outlet, before lone low-desk ones. */
export const SWEEP_TRIAGE_PRIORITY = 60

/**
 * A lone-outlet cluster on a low-weight desk (world, ai, cricket at 0.6 or less) that is still untriaged 6 h after its
 * first item and was never trending is closed by rule. Pakistan stories (0.77) and anything with a trend hit or a second
 * outlet are never closed here.
 */
export function loneLowDeskReject(c: Cluster, o: { weights?: Record<string, number> | null; now?: number }): string | null {
  if (c.distinctSources >= 2 || isTrendMarked(c.items)) return null
  const desk = guessDesk(c)
  if (deskWeight(desk, o.weights) > LOW_DESK_WEIGHT) return null
  const first = oldestMs(c.items)
  if (!first || (o.now ?? Date.now()) - first < LONE_LOW_DESK_CLOSE_MS) return null
  return `lone outlet on the ${desk} desk (weight ${deskWeight(desk, o.weights)}), untriaged for 6 h: closed by rule, no model call`
}

/** Backoff when every model is cooling or token-limited: 10-15 minutes with jitter, not a minute. */
export const BACKOFF_MIN_MS = 10 * 60_000
export function backoffMs(): number {
  return BACKOFF_MIN_MS + Math.floor(Math.random() * 5 * 60_000)
}
