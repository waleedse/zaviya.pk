/**
 * FBR Active Taxpayer List (ATL) status page (ZAV-218). The check itself happens on FBR's portal or by SMS to 9966:
 * Zaviya never receives or stores a CNIC. Edit this file when FBR changes the channels.
 */
export const ATL = {
  smsShortcode: '9966',
  portalUrl: 'https://e.fbr.gov.pk/esbn/Service.aspx?PID=Dbue2kxCaiyqHHkwEvtwFA==',
  listUrl: 'https://fbr.gov.pk/Downloads/?id=3901&Type=Docs',
  fbrPageUrl: 'https://www.fbr.gov.pk/categ/check-active-taxpayer-status/51147/30859/71169',
  asOf: '2026-10-27',
}

/** Digits only; a CNIC has 13, an NTN 7. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, '')
}

export type AtlIdKind = 'cnic' | 'ntn' | 'invalid'

export function atlIdKind(input: string): AtlIdKind {
  const d = digitsOnly(input)
  if (d.length === 13) return 'cnic'
  if (d.length === 7) return 'ntn'
  return 'invalid'
}

/** The exact SMS text FBR documents: "ATL" + space + 13-digit CNIC (or 7-digit NTN). Empty when the number is the wrong length. */
export function atlSmsText(input: string): string {
  return atlIdKind(input) === 'invalid' ? '' : `ATL ${digitsOnly(input)}`
}
