/**
 * Income tax return deadline page (ZAV-102). Edit this file only: the page, the sitemap and the homepage "Coming up" link read it.
 * Update DEADLINE (and circular/source) when FBR moves the date again; never state a new date before FBR or a major outlet reports it.
 */
export const DEADLINE = {
  date: '2026-10-31',
  taxYear: '2026',
  circular: 'FBR Circular No. 04 of 2026-27',
  previousDate: '2026-10-15',
  asOf: '2026-10-26',
}

export const SOURCES = [
  { label: 'FBR IRIS portal', url: 'https://iris.fbr.gov.pk/' },
  { label: 'FBR: file income tax return', url: 'https://www.fbr.gov.pk/categ/file-income-tax-return/51147/80860/71160' },
  { label: 'Dawn: FBR extends deadline', url: 'https://www.dawn.com/news/2037394' },
  { label: 'Geo News: FBR further extends deadline to October 31', url: 'https://www.geo.tv/latest/686729-fbr-further-extends-income-tax-return-filing-deadline-to-october-31' },
]

/** Whole days from today (Pakistan time) to the deadline; negative once it has passed. */
export function daysToDeadline(now: Date = new Date()): number {
  const today = new Date(now.getTime() + 5 * 3_600_000).toISOString().slice(0, 10)
  return Math.round((Date.parse(`${DEADLINE.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}
