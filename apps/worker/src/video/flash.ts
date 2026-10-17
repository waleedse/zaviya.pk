import type { ApiArticle } from './lib.js'
import { KARACHI_OFFSET_MS, karachiDate, runsOn, slotTimeMs, type Slot } from './schedule.js'

/**
 * Breaking flash (15 s, one story). Checked every 10 minutes; the rules keep it rare so it never floods followers:
 * at most 2 a day, at least 3 h apart, never within 45 min of a scheduled video, only for a story published in the
 * last 45 min that is marked breaking.
 */
export const FLASH_RULES = { maxPerDay: 2, minGapMs: 3 * 3600_000, slotBufferMs: 45 * 60_000, freshMs: 45 * 60_000 }

export interface FlashState {
  /** ids already flashed */
  done: Set<number>
  /** flashes posted today (Karachi) */
  countToday: number
  /** epoch ms of the last flash, or 0 */
  lastAt: number
}

export function isBreaking(a: Pick<ApiArticle, 'isBreaking' | 'priority'>): boolean {
  return a.isBreaking === true || a.priority === 'breaking'
}

/** The article to flash now, or null with the reason (for the log). */
export function pickFlash(articles: ApiArticle[], state: FlashState, slots: Slot[], now: number): { id: number } | { skip: string } {
  if (state.countToday >= FLASH_RULES.maxPerDay) return { skip: 'daily flash limit reached' }
  if (state.lastAt && now - state.lastAt < FLASH_RULES.minGapMs) return { skip: 'last flash was less than 3 h ago' }
  const weekday = new Date(now + KARACHI_OFFSET_MS).getUTCDay()
  const near = slots.find((s) => runsOn(s, weekday) && Math.abs(slotTimeMs(s, now) - now) < FLASH_RULES.slotBufferMs)
  if (near) return { skip: `scheduled video "${near.name}" is within 45 min` }
  const fresh = articles
    .filter((a) => isBreaking(a) && !state.done.has(a.id) && a.heroImage?.url)
    .filter((a) => {
      const age = now - Date.parse(a.publishedAt)
      return age >= 0 && age <= FLASH_RULES.freshMs
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  return fresh[0] ? { id: fresh[0].id } : { skip: 'no fresh breaking story' }
}

/** A one-off slot for a flash, timed now so the veto counts from the preview. */
export function flashSlot(id: number, now: number): Slot {
  const t = new Date(now + KARACHI_OFFSET_MS)
  return {
    name: `flash-${id}`,
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    format: 'flash15',
    topic: null,
    edition: t.getUTCHours() >= 15 ? 'evening' : 'morning',
    days: '*',
  }
}

export const flashKeys = (now: number) => ({
  done: 'video:flash:done',
  count: `video:flash:count:${karachiDate(now)}`,
  last: 'video:flash:last',
})
