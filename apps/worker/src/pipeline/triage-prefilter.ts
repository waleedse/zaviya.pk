import { hasFreshSource } from './pitch.js'
import { opinionCue } from './story-kind.js'

/** Scorecards, live-score pages and photo captions: the code rules already call these low value (triage-rules.ts). */
const LOW_VALUE_TITLE = /\b(scorecard|live[- ]?score|photo caption)\b/i

function newestSourceMs(items: { publishedAt?: string }[]): number {
  const times = items.map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : NaN)).filter(Number.isFinite)
  return times.length ? Math.max(...times) : 0
}

/**
 * A reason to close the cluster without asking the model (every Gemini call is counted against a small free daily
 * quota), or null. Only things the rules close anyway; a story that is trending in Pakistan is never filtered.
 */
export function prefilterReject(
  cluster: { headline?: string; items: { title: string; url?: string; publishedAt?: string; summary?: string | null; contentText?: string | null }[] },
  o: { trending: boolean; now?: number },
): string | null {
  if (o.trending) return null
  const titles = [cluster.headline, ...cluster.items.map((i) => i.title)].filter((t): t is string => Boolean(t))
  // no dated source from the last 18 hours: the publish step would refuse it anyway
  if (cluster.items.length && newestSourceMs(cluster.items) > 0 && !hasFreshSource(cluster.items, o.now)) {
    return 'stale sources: no source from the last 18 hours (decided by rule, no model call)'
  }
  if (titles.length && titles.every((t) => LOW_VALUE_TITLE.test(t))) return 'low value: scorecard, live score or photo caption (decided by rule, no model call)'
  const cue = cluster.items.length ? opinionCue(cluster.items as Parameters<typeof opinionCue>[0]) : null
  if (cue) return cue
  return null
}
