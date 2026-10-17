/**
 * Prize bond draw schedule 2026 (National Savings, https://savings.gov.pk/prize-bonds/).
 * Edit this list only: the page and the sitemap read it. Draw numbers are listed only when confirmed;
 * no results are stored here (ZAV-58). The 10 Dec Rs25,000 draw is Karachi per the full-year list.
 */
export interface PrizeBondDraw {
  /** ISO date of the draw */
  date: string
  denomination: number
  city: string
  /** Draw number, only when confirmed */
  drawNo?: number
}

export const PRIZE_BOND_DRAWS_2026: PrizeBondDraw[] = [
  { date: '2026-10-15', denomination: 750, city: 'Rawalpindi', drawNo: 108 },
  { date: '2026-11-16', denomination: 1500, city: 'Hyderabad' },
  { date: '2026-11-16', denomination: 100, city: 'Faisalabad' },
  { date: '2026-12-10', denomination: 40000, city: 'Lahore' },
  { date: '2026-12-10', denomination: 25000, city: 'Karachi' },
  { date: '2026-12-15', denomination: 200, city: 'Peshawar' },
]

/** Draws on or after `now` (date only, Pakistan time), soonest first. */
export function upcomingDraws(now: Date = new Date(), draws: PrizeBondDraw[] = PRIZE_BOND_DRAWS_2026): PrizeBondDraw[] {
  const today = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10)
  return draws.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date) || b.denomination - a.denomination)
}

export function formatRs(n: number): string {
  return `Rs${n.toLocaleString('en-US')}`
}
