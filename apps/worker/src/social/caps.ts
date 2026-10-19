import type { Priority } from '@zaviya/shared'

export type SocialPlatform = 'facebook' | 'instagram' | 'x'

/**
 * Hard ceiling per platform while the audience is small (growth strategy 4.4, ZAV-115). The Settings value can lower
 * it but not raise it; lift this constant when the pages pass ~500 followers.
 */
export const SOCIAL_CAP_CEILING: Record<SocialPlatform, number> = { facebook: 8, instagram: 5, x: 10 }

/** At least this long between two posts on one platform (breaking news is exempt) */
export const MIN_GAP_MS = 45 * 60_000
/** A queued post older than this is no longer news: skip it instead of waiting for the next slot */
export const MAX_WAIT_MS = 10 * 60 * 60_000

const PKT_OFFSET_MS = 5 * 60 * 60_000
/** Peak hours in PKT as [start, end) hours */
export const PEAK_WINDOWS: [number, number][] = [
  [8, 10],
  [13, 14],
  [20, 23],
]

export function effectiveCap(platform: SocialPlatform, settingsCaps?: Record<string, number>): number {
  const set = settingsCaps?.[platform]
  const ceiling = SOCIAL_CAP_CEILING[platform]
  return typeof set === 'number' && set >= 0 ? Math.min(set, ceiling) : ceiling
}

/** Start of the current PKT calendar day, as an ISO string */
export function pktDayStart(now: number): string {
  const local = now + PKT_OFFSET_MS
  const startLocal = local - (((local % 86_400_000) + 86_400_000) % 86_400_000)
  return new Date(startLocal - PKT_OFFSET_MS).toISOString()
}

function pktMinuteOfDay(ms: number): number {
  const local = ms + PKT_OFFSET_MS
  return Math.floor((((local % 86_400_000) + 86_400_000) % 86_400_000) / 60_000)
}

export function inPeakWindow(ms: number): boolean {
  const m = pktMinuteOfDay(ms)
  return PEAK_WINDOWS.some(([a, b]) => m >= a * 60 && m < b * 60)
}

/** The first moment at or after `ms` that falls inside a peak window */
export function nextPeakStart(ms: number): number {
  const base = Math.floor(ms / 60_000) * 60_000
  for (let step = 0; step <= 2 * 24 * 60; step++) {
    const t = base + step * 60_000
    if (inPeakWindow(t)) return t
  }
  return ms
}

export type SlotDecision = { action: 'post' } | { action: 'skip'; reason: string } | { action: 'delay'; until: number; reason: string }

export function decideSlot(input: {
  platform: SocialPlatform
  priority: Priority
  now: number
  /** when the job was queued */
  queuedAt: number
  settingsCaps?: Record<string, number>
  postedToday: number
  lastPostedAt?: string | null
}): SlotDecision {
  const cap = effectiveCap(input.platform, input.settingsCaps)
  if (input.postedToday >= cap) return { action: 'skip', reason: `daily cap reached (${input.postedToday}/${cap})` }
  if (input.priority === 'breaking') return { action: 'post' }
  if (input.now - input.queuedAt > MAX_WAIT_MS) return { action: 'skip', reason: 'waited too long for a slot' }
  let at = input.now
  const last = input.lastPostedAt ? Date.parse(input.lastPostedAt) : NaN
  if (!Number.isNaN(last)) at = Math.max(at, last + MIN_GAP_MS)
  at = nextPeakStart(at)
  if (at <= input.now) return { action: 'post' }
  return { action: 'delay', until: at, reason: inPeakWindow(input.now) ? 'spacing' : 'outside peak hours' }
}
