/**
 * When each agent runs. Times are Pakistan time (PKT, UTC+5, no DST).
 * - every: run when this many minutes passed since the last run (optionally a different gap at night)
 * - at:    run once a day at HH:MM (optionally only on some weekdays, 0 = Sunday)
 */
/** Agents that run on the server. PM, engineer, SEO and social run on Waleed's Mac (Claude app scheduled tasks). */
export type AgentName = 'editor' | 'research'

export interface Slot {
  session: string
  every?: number
  nightEvery?: number
  at?: string
  days?: number[]
}

export const SCHEDULE: Record<AgentName, Slot[]> = {
  // Newsroom oversight: a full pass hourly by day (every 3 hours at night), and a quick check of the
  // newest articles every 15 minutes so mistakes are fixed soon after publishing
  editor: [
    { session: 'hourly', every: 60, nightEvery: 180 },
    { session: 'quick', every: 15, nightEvery: 30 },
  ],
  // Growth research once a day: trends, evergreen search demand, ideas for the PM (Linear)
  research: [{ session: 'daily', at: '09:30' }],
}

/** Agent run timeouts in minutes */
export const TIMEOUT_MIN: Record<AgentName, number> = { editor: 15, research: 25 }

const PKT_OFFSET_MS = 5 * 60 * 60_000

export function pktParts(now: Date): { day: number; hour: number; minute: number; dateKey: string } {
  const p = new Date(now.getTime() + PKT_OFFSET_MS)
  return {
    day: p.getUTCDay(),
    hour: p.getUTCHours(),
    minute: p.getUTCMinutes(),
    dateKey: p.toISOString().slice(0, 10),
  }
}

export function isNight(now: Date): boolean {
  const { hour } = pktParts(now)
  return hour >= 1 && hour < 7
}

/** Epoch ms of today's HH:MM in PKT */
export function todayAt(now: Date, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const { dateKey } = pktParts(now)
  return Date.parse(`${dateKey}T00:00:00Z`) - PKT_OFFSET_MS + (h * 60 + m) * 60_000
}

/** Is this slot due, given when it last ran (epoch ms, 0 = never)? */
export function isDue(slot: Slot, now: Date, lastRun: number): boolean {
  const t = now.getTime()
  if (slot.at) {
    if (slot.days && !slot.days.includes(pktParts(now).day)) return false
    const at = todayAt(now, slot.at)
    // Due from the slot time until 3 hours later (a late start still counts, a whole missed day does not)
    return t >= at && t < at + 3 * 60 * 60_000 && lastRun < at
  }
  const gap = (isNight(now) && slot.nightEvery ? slot.nightEvery : slot.every ?? 60) * 60_000
  return t - lastRun >= gap
}

export function slotKey(agent: AgentName, slot: Slot): string {
  return `${agent}:${slot.session}`
}
