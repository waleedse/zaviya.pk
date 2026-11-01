import { pktDate } from './web-stories'

/** ZAV-281: daily archive hubs at /archive/YYYY-MM-DD (Pakistan calendar day) so Google can reach every story by plain links. */

export const ARCHIVE_DAYS = 60

export const archivePath = (date?: string): string => (date ? `/archive/${date}` : '/archive')

/** 'YYYY-MM-DD' that is a real calendar date, else false. */
export function isArchiveDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

/** UTC instants that bound a Pakistan day (UTC+5, no DST): [start, end). */
export function archiveDayRange(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00Z`).getTime() - 5 * 3_600_000
  return { start: new Date(start).toISOString(), end: new Date(start + 24 * 3_600_000).toISOString() }
}

/** Pakistan days from `now` back `days` days, newest first (today included). */
export function recentArchiveDates(now: Date = new Date(), days: number = ARCHIVE_DAYS): string[] {
  const today = pktDate(now)
  const base = new Date(`${today}T00:00:00Z`).getTime()
  return Array.from({ length: days }, (_, i) => new Date(base - i * 86_400_000).toISOString().slice(0, 10))
}

/** A date the archive serves: valid, not in the future, within the last ARCHIVE_DAYS days. */
export function isServedArchiveDate(date: string, now: Date = new Date()): boolean {
  return isArchiveDate(date) && recentArchiveDates(now).includes(date)
}

export function archiveDateLabel(date: string, locale: 'en' | 'ur'): string {
  return new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}
