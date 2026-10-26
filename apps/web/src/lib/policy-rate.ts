/**
 * SBP policy rate page (ZAV-206). Edit this file only: the page, the sitemap and the homepage "Coming up" link read it.
 * sbp.org.pk blocks automated fetches, so numbers are copied by hand from the SBP homepage / Monetary Policy Statement.
 * Never put a decision here before the statement is out. After each MPC: update POLICY, CORRIDOR and AS_OF.
 * KIBOR stays null until a fix is copied from https://www.sbp.org.pk/ecodata/kibor_index.asp (no invented numbers).
 */
// 26 Oct 2026 MPC: +50 bps to 12% (9-1 vote; Bloomberg and our own reports). The corridor is the policy rate +/- 1.0 point, the same width as the
// 23 Oct figures; SBP's statement text was not readable (sbp.org.pk blocks fetches), so confirm 11.0-13.0 against the statement.
export const POLICY = { rate: 12, corridorFloor: 11, corridorCeiling: 13, asOf: '2026-10-26', lastChanged: '2026-10-26' as string | null }

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
