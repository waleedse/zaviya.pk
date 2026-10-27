/**
 * E-passport fee chart (ZAV-195). Edit this file only; the page and the sitemap read it.
 * Fees are as reported 15 Oct 2026 by ProPakistani and ARY News, attributed to the Directorate General of Immigration
 * and Passports (DGIP). Neither report links the DGIP notice, so the page says so. The unconfirmed Rs22,000
 * "fast-track" figure circulating elsewhere is deliberately NOT shown until DGIP confirms it.
 */
export interface PassportFee {
  years: 5 | 10
  pages: 36 | 72
  normal: number
  urgent: number
}

export const FEES: PassportFee[] = [
  { years: 5, pages: 36, normal: 9000, urgent: 15000 },
  { years: 5, pages: 72, normal: 16500, urgent: 27000 },
  { years: 10, pages: 36, normal: 13500, urgent: 22500 },
  { years: 10, pages: 72, normal: 24750, urgent: 40500 },
]

export const PASSPORT = {
  asOf: '2026-10-27',
  officialSite: 'https://www.dgip.gov.pk/',
}

export const SOURCES = [
  { label: 'DGIP (official site, check for the fee notice)', url: PASSPORT.officialSite },
  { label: 'ProPakistani: Govt announces e-passport fees', url: 'https://propakistani.pk/2026/10/15/govt-announces-e-passport-fees-in-pakistan/' },
  { label: 'ARY News: new fee structure for 2026', url: 'https://arynews.tv/e-passport-pakistan-announces-new-fee-structure-for-2026' },
]

export function findFee(years: number, pages: number): PassportFee | undefined {
  return FEES.find((f) => f.years === years && f.pages === pages)
}

export const rs = (n: number) => `Rs${n.toLocaleString('en-US')}`
