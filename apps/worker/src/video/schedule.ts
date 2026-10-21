import type { Edition, Format, Topic } from './lib.js'

/** The plan in docs/VIDEO.md: render times (posting follows 20 min later: 08:00, 13:00, 17:30, 20:00 PKT) */
export const DEFAULT_SLOTS =
  'morning@07:40=headlines30,money@12:40/mon-sat=money45,ai@17:10/tue+thu+sat=topic60:ai-tech,evening@19:40=roundup60'
const FORMATS: Format[] = ['flash15', 'trend25', 'headlines30', 'roundup60', 'topic60', 'money45']
const TOPICS: Topic[] = ['ai-tech', 'money']
export const KARACHI_OFFSET_MS = 5 * 3600 * 1000

export interface Slot {
  name: string
  hour: number
  minute: number
  format: Format
  topic: Topic | null
  edition: Edition
  /** cron day-of-week field: '*' = every day, e.g. '1-6' (Mon-Sat) or '2,4,6' (Tue, Thu, Sat) */
  days: string
}

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

/** `mon-sat` -> '1-6', `tue+thu+sat` -> '2,4,6'. Throws on unknown day names. */
export function parseDays(spec: string | undefined): string {
  if (!spec) return '*'
  const range = /^([a-z]{3})-([a-z]{3})$/.exec(spec)
  if (range) {
    const a = DOW[range[1]!]
    const b = DOW[range[2]!]
    if (a === undefined || b === undefined) throw new Error(`unknown days "${spec}" in VIDEO_SLOTS`)
    return `${a}-${b}`
  }
  const list = spec.split('+').map((d) => DOW[d])
  if (!list.length || list.some((d) => d === undefined)) throw new Error(`unknown days "${spec}" in VIDEO_SLOTS`)
  return list.join(',')
}

/** Does the slot run on this Karachi weekday (0 = Sunday)? */
export function runsOn(s: Slot, weekday: number): boolean {
  if (s.days === '*') return true
  return s.days.split(',').some((part) => {
    const [a, b] = part.split('-').map(Number)
    return b === undefined ? weekday === a : weekday >= a! && weekday <= b
  })
}

/** `name@HH:MM[/days]=format[:topic]`, comma separated; days are `mon-sat` or `tue+thu+sat`. Throws on a malformed entry so a typo never silently drops a slot. */
export function parseSlots(spec: string | undefined): Slot[] {
  const out: Slot[] = []
  for (const raw of (spec?.trim() ? spec : DEFAULT_SLOTS).split(',')) {
    const part = raw.trim()
    if (!part) continue
    const m = /^([a-z][a-z0-9-]*)@(\d{1,2}):(\d{2})(?:\/([a-z+-]+))?=([a-z0-9]+)(?::([a-z-]+))?$/.exec(part)
    if (!m) throw new Error(`bad VIDEO_SLOTS entry "${part}" (want name@HH:MM[/days]=format[:topic])`)
    const [, name, h, mi, days, format, topic] = m
    const hour = Number(h)
    const minute = Number(mi)
    if (hour > 23 || minute > 59) throw new Error(`bad time in VIDEO_SLOTS entry "${part}"`)
    if (!FORMATS.includes(format as Format)) throw new Error(`unknown format "${format}" in VIDEO_SLOTS`)
    if (topic && !TOPICS.includes(topic as Topic)) throw new Error(`unknown topic "${topic}" in VIDEO_SLOTS`)
    if (out.some((s) => s.name === name)) throw new Error(`duplicate slot "${name}"`)
    out.push({
      name: name!,
      hour,
      minute,
      format: format as Format,
      topic: (topic as Topic | undefined) ?? (format === 'money45' ? 'money' : format === 'topic60' ? 'ai-tech' : null),
      edition: hour >= 15 || name!.startsWith('evening') ? 'evening' : 'morning',
      days: parseDays(days),
    })
  }
  return out
}

export const schedulerId = (s: Slot | string) => `video-${typeof s === 'string' ? s : s.name}`

/** BullMQ repeat options: the slot time on its days, Karachi time zone */
export function repeatFor(s: Slot) {
  return { pattern: `${s.minute} ${s.hour} * * ${s.days}`, tz: 'Asia/Karachi' }
}

/** YYYY-MM-DD in Karachi */
export function karachiDate(ms: number): string {
  return new Date(ms + KARACHI_OFFSET_MS).toISOString().slice(0, 10)
}

/** Key of one edition: Karachi date and slot name */
export function editionKey(slot: Slot | string, ms: number): string {
  return `${karachiDate(ms)}-${typeof slot === 'string' ? slot : slot.name}`
}

/** Today's (Karachi) occurrence of the slot, as epoch ms */
export function slotTimeMs(s: Slot, ms: number): number {
  const [y, mo, d] = karachiDate(ms).split('-').map(Number)
  return Date.UTC(y!, mo! - 1, d!, s.hour, s.minute) - KARACHI_OFFSET_MS
}

/** Post time = render (slot) time + veto minutes. A manual run far from the slot time counts from now instead. */
export function postAtMs(s: Slot, now: number, vetoMin: number): number {
  const slotAt = slotTimeMs(s, now)
  const base = Math.abs(now - slotAt) <= 2 * 3600 * 1000 ? slotAt : now
  return base + vetoMin * 60_000
}

export function hhmm(ms: number): string {
  return new Date(ms + KARACHI_OFFSET_MS).toISOString().slice(11, 16)
}

/** Scheduler ids to remove: any `video-*` scheduler that is no longer configured */
export function staleSchedulers(existingIds: string[], slots: Slot[]): string[] {
  const wanted = new Set(slots.map(schedulerId))
  return existingIds.filter((id) => id.startsWith('video-') && !wanted.has(id))
}
