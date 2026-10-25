/**
 * SBP policy rate page (ZAV-206). Edit this file only: the page, the sitemap and the homepage "Coming up" link read it.
 * sbp.org.pk blocks automated fetches, so numbers are copied by hand from the SBP homepage / Monetary Policy Statement.
 * Never put a decision here before the statement is out. After each MPC: update POLICY, CORRIDOR and AS_OF.
 * KIBOR stays null until a fix is copied from https://www.sbp.org.pk/ecodata/kibor_index.asp (no invented numbers).
 */
export const POLICY = { rate: 11.5, corridorFloor: 10.5, corridorCeiling: 12.5, asOf: '2026-10-23', lastChanged: null as string | null }

export interface KiborRow {
  tenor: '3M' | '6M' | '12M'
  bid: number
  offer: number
}
export const KIBOR: { asOf: string; rows: KiborRow[] } | null = null

/** FY27 MPC calendar (SBP). The statement is released the same day. */
export const MPC_DATES_FY27 = ['2026-10-26', '2026-12-14', '2027-01-25', '2027-03-08', '2027-04-26', '2027-06-17'] as const

/** Next MPC on or after today (Pakistan time). */
export function nextMpc(now: Date = new Date()): string | null {
  const today = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10)
  return MPC_DATES_FY27.find((d) => d >= today) ?? null
}
