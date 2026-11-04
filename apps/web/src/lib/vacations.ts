import { dateLabel } from './result-boards'

/**
 * Winter vacations 2026-27 and the "schools closed tomorrow" tracker. Regions and wording live here; every date is
 * data in Payload (`vacation-notices`, `school-closures`) and carries a source. Nothing here invents a date.
 */

export type VacationRegion = 'punjab' | 'sindh' | 'kp' | 'balochistan' | 'islamabad'
export type VacationStatus = 'not_announced' | 'reported' | 'notified'
export type ClosureReason = 'smog' | 'rain' | 'weather' | 'security' | 'other'

export interface VacationRegionDef {
  slug: VacationRegion
  name: string
  /** Who notifies the break */
  authority: string
  /** Roman Urdu question people type */
  romanUrdu: string
}

export const VACATION_REGIONS: VacationRegionDef[] = [
  { slug: 'punjab', name: 'Punjab', authority: 'the Punjab School Education Department', romanUrdu: 'Punjab mein winter vacations kab hongi?' },
  { slug: 'sindh', name: 'Sindh', authority: 'the Sindh School Education and Literacy Department', romanUrdu: 'Sindh mein winter vacations kab hongi?' },
  { slug: 'kp', name: 'Khyber Pakhtunkhwa', authority: 'the Khyber Pakhtunkhwa Elementary and Secondary Education Department', romanUrdu: 'KPK mein winter vacations kab hongi?' },
  { slug: 'balochistan', name: 'Balochistan', authority: 'the Balochistan Secondary Education Department', romanUrdu: 'Balochistan mein winter vacations kab hongi?' },
  { slug: 'islamabad', name: 'Islamabad', authority: 'the Federal Directorate of Education', romanUrdu: 'Islamabad mein winter vacations kab hongi?' },
]

export const vacationRegionBySlug = (slug: string): VacationRegionDef | undefined => VACATION_REGIONS.find((r) => r.slug === slug)

export const SEASON = '2026-27'
export const vacationsHubPath = (): string => `/winter-vacations-${SEASON}`
export const vacationRegionPath = (slug: string): string => `${vacationsHubPath()}/${slug}`
export const closuresPath = (): string => '/school-closed-tomorrow-pakistan'

export interface VacationView {
  region: VacationRegion
  status: VacationStatus
  startDate?: string
  endDate?: string
  sourceUrl?: string
  sourceNote?: string
  sourceDate?: string
  lastYear?: { startDate?: string; endDate?: string; note?: string; sourceUrl?: string }
  notes?: string
  updatedAt?: string
}

export interface ClosureView {
  id?: number | string
  region: VacationRegion
  scope: string
  date: string
  endDate?: string
  reason: ClosureReason
  status: 'announced' | 'extended' | 'cancelled'
  sourceUrl?: string
  sourceNote?: string
  notes?: string
  updatedAt?: string
}

export function vacationText(v: Pick<VacationView, 'status' | 'startDate' | 'endDate'>): string {
  if (v.status === 'not_announced' || !v.startDate) return 'Not announced yet'
  const range = v.endDate ? `${dateLabel(v.startDate)} to ${dateLabel(v.endDate)}` : `from ${dateLabel(v.startDate)}`
  return v.status === 'notified' ? range : `Reported: ${range} (not yet officially notified)`
}

export type ClosureState = 'today' | 'tomorrow' | 'upcoming' | 'past' | 'cancelled'

const addDays = (day: string, n: number): string => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)

export function closureState(c: Pick<ClosureView, 'date' | 'endDate' | 'status'>, today: string): ClosureState {
  if (c.status === 'cancelled') return 'cancelled'
  const end = c.endDate && c.endDate >= c.date ? c.endDate : c.date
  if (end < today) return 'past'
  if (c.date <= today) return 'today'
  if (c.date === addDays(today, 1)) return 'tomorrow'
  return 'upcoming'
}

/** Closures still relevant (today, tomorrow or later), soonest first. */
export function activeClosures(list: ClosureView[], today: string): (ClosureView & { state: ClosureState })[] {
  return list
    .map((c) => ({ ...c, state: closureState(c, today) }))
    .filter((c) => c.state === 'today' || c.state === 'tomorrow' || c.state === 'upcoming')
    .sort((a, b) => a.date.localeCompare(b.date))
}

export const closureTomorrow = (list: ClosureView[], today: string): (ClosureView & { state: ClosureState })[] =>
  activeClosures(list, today).filter((c) => c.state === 'tomorrow' || (c.state === 'today' && (c.endDate ?? c.date) >= addDays(today, 1)))

export function closureRange(c: Pick<ClosureView, 'date' | 'endDate'>): string {
  return c.endDate && c.endDate > c.date ? `${dateLabel(c.date)} to ${dateLabel(c.endDate)}` : dateLabel(c.date)
}

export const REASON_LABEL: Record<ClosureReason, string> = { smog: 'Smog', rain: 'Rain', weather: 'Weather', security: 'Security', other: 'Other' }

/** Links an article about winter breaks or school closures should carry. */
export function matchVacationLinks(text: string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = []
  if (/\bwinter (vacations?|breaks?|holidays?)\b/i.test(text)) {
    const region = VACATION_REGIONS.find((r) => new RegExp(`\\b${r.name === 'Khyber Pakhtunkhwa' ? '(KP|KPK|Khyber Pakhtunkhwa)' : r.name}\\b`, 'i').test(text))
    if (region) out.push({ label: `Winter vacations ${SEASON} in ${region.name}: dates and source`, href: vacationRegionPath(region.slug) })
    out.push({ label: `Winter vacations ${SEASON} in every province`, href: vacationsHubPath() })
  }
  if (/\bschools?\b/i.test(text) && /\b(closed|closure|closures|shut|holidays?)\b/i.test(text) && /\b(smog|rain|weather|aqi|tomorrow)\b/i.test(text)) {
    out.push({ label: 'Schools closed tomorrow: smog and weather closures', href: closuresPath() })
  }
  return out
}
