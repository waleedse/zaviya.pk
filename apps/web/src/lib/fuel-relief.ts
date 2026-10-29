/**
 * PM Fuel Relief Scheme (SMS 9771) facts for /fuel-relief-9771-pakistan (ZAV-247). Edit this file only.
 * Every figure is from Geo (13 Sep), ProPakistani (13 and 19 Sep), Tribune (14 Sep) and ARY, quoting IT Minister Shaza Fatima
 * and the Ministry of IT. Diesel is NOT covered by anything we have read; do not add it until a notified rule says so.
 */
export const RELIEF = {
  shortcode: '9771',
  complaintsCode: '9772',
  perLitre: 100,
  asOf: '2026-10-29',
}

export const SOURCES = [
  { label: 'Geo: how to apply for Rs100-per-litre petrol relief (13 Sep)', url: 'https://www.geo.tv/latest/681919-explainer-how-can-you-apply-for-rs100-per-litre-petrol-relief' },
  { label: 'Tribune: govt details registration process (14 Sep)', url: 'https://tribune.com.pk/story/2629232/govt-details-registration-process-for-rs100-petrol-subsidy' },
  { label: 'ARY: PM orders free SMS service for registration', url: 'https://arynews.tv/petrol-subsidy-pm-sharif-orders-free-sms-service-for-registration' },
  { label: 'ProPakistani: how to get discounted petrol (13 Sep)', url: 'https://propakistani.pk/2026/09/13/how-to-get-discounted-petrol-for-bikes-rickshaws-qingis-and-cars/' },
  { label: 'ProPakistani: govt allows more petrol per token (19 Sep)', url: 'https://propakistani.pk/2026/09/19/govt-allows-more-petrol-per-token/' },
  { label: 'Radio Pakistan: 2.2m+ registered under the scheme (20 Sep)', url: 'https://radio.gov.pk/20-09-2026/over-22m-people-registered-under-special-fuel-relief-scheme-tarar' },
]

/** Single-letter province codes as listed by ProPakistani; officials say "first letter or full name of the province". */
export const PROVINCES = [
  { code: 'I', en: 'Islamabad', ur: 'اسلام آباد' },
  { code: 'P', en: 'Punjab', ur: 'پنجاب' },
  { code: 'S', en: 'Sindh', ur: 'سندھ' },
  { code: 'K', en: 'Khyber Pakhtunkhwa', ur: 'خیبر پختونخوا' },
  { code: 'B', en: 'Balochistan', ur: 'بلوچستان' },
  { code: 'A', en: 'Azad Kashmir', ur: 'آزاد کشمیر' },
  { code: 'G', en: 'Gilgit-Baltistan', ur: 'گلگت بلتستان' },
] as const

export const digitsOnly = (s: string) => s.replace(/\D/g, '')

/** yyyy-mm-dd (from <input type=date>) to DDMMYYYY, or '' when it is not a full date. */
export function regDateToken(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}${m[2]}${m[1]}` : ''
}

export function cleanPlate(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '-')
}

/** "REG <CNIC> <vehicle> <province> <DDMMYYYY>" or '' until every part is valid. */
export function regSmsText(cnic: string, plate: string, province: string, isoDate: string): string {
  const id = digitsOnly(cnic)
  const date = regDateToken(isoDate)
  const veh = cleanPlate(plate)
  if (id.length !== 13 || !veh || !date || !PROVINCES.some((p) => p.code === province)) return ''
  return `REG ${id} ${veh} ${province} ${date}`
}

/** Rs per litre after the relief, for an illustration only. */
export const netPetrolPrice = (pump: number) => Math.round((pump - RELIEF.perLitre) * 100) / 100
