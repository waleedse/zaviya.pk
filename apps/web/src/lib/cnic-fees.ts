/**
 * NADRA CNIC / Smart NIC / NICOP fee chart. Edit this file only; the page and the sitemap read it.
 * Copied by hand from NADRA's own fee page (https://www.nadra.gov.pk/feeStructure, "Last Updated 17-09-2026"),
 * read 16 Nov 2026. Official source only. Search demand (Google autocomplete, PK): "nadra id card fees 2026",
 * "cnic fee in pakistan 2026", "nadra id card fee urgent", "nadra id card fee and time".
 */
export interface IdFee {
  key: string
  en: string
  ur: string
  /** rupees, null = not offered */
  normal: number | null
  urgent: number | null
  executive: number | null
  /** days */
  days: [number | null, number | null, number | null]
}

export const CNIC_FEES: IdFee[] = [
  { key: 'new-cnic', en: 'New CNIC (first card)', ur: 'نیا شناختی کارڈ (پہلی بار)', normal: 0, urgent: 1150, executive: 2150, days: [15, 12, 6] },
  { key: 'cnic-renewal', en: 'CNIC renewal', ur: 'شناختی کارڈ کی تجدید', normal: 400, urgent: 1150, executive: 2150, days: [15, 12, 6] },
  { key: 'cnic-modification', en: 'CNIC modification', ur: 'شناختی کارڈ میں تبدیلی', normal: 400, urgent: 1150, executive: 2150, days: [15, 12, 6] },
  { key: 'cnic-duplicate', en: 'Duplicate CNIC (lost card)', ur: 'ڈپلیکیٹ شناختی کارڈ', normal: 400, urgent: 1150, executive: 2150, days: [15, 12, 6] },
  { key: 'snic-new', en: 'New Smart NIC', ur: 'نیا اسمارٹ کارڈ', normal: 750, urgent: 1500, executive: 2500, days: [31, 23, 9] },
  { key: 'snic-renewal', en: 'Smart NIC renewal', ur: 'اسمارٹ کارڈ کی تجدید', normal: 750, urgent: 1500, executive: 2500, days: [31, 23, 9] },
  { key: 'snic-modification', en: 'Smart NIC modification', ur: 'اسمارٹ کارڈ میں تبدیلی', normal: 750, urgent: 1500, executive: 2500, days: [31, 23, 9] },
  { key: 'snic-duplicate', en: 'Duplicate Smart NIC', ur: 'ڈپلیکیٹ اسمارٹ کارڈ', normal: 750, urgent: 1500, executive: 2500, days: [31, 23, 9] },
  { key: 'crc', en: 'CRC (child registration, B-form card)', ur: 'سی آر سی (بچوں کا کارڈ)', normal: 50, urgent: null, executive: 500, days: [7, null, 1] },
  { key: 'frc', en: 'FRC (family registration, one family)', ur: 'ایف آر سی (خاندانی سرٹیفکیٹ)', normal: null, urgent: null, executive: 1000, days: [null, null, 1] },
]

/** Smart NICOP, US dollars, new / renewal / modification (NADRA lists the same amounts for each). */
export const NICOP_FEES = [
  { zone: 'A', en: 'Zone A (USA and Europe)', ur: 'زون اے (امریکہ اور یورپ)', normal: 39, urgent: 57, executive: 75 },
  { zone: 'B', en: 'Zone B (Middle East and Africa)', ur: 'زون بی (مشرق وسطیٰ اور افریقہ)', normal: 20, urgent: 30, executive: 40 },
]

export const AGE_FEES = [
  { en: 'Up to 1 year', ur: 'ایک سال تک', inland: 1000 },
  { en: '1 to 2 years', ur: '1 سے 2 سال', inland: 2000 },
  { en: '2 to 3 years', ur: '2 سے 3 سال', inland: 3000 },
  { en: 'More than 3 years', ur: '3 سال سے زیادہ', inland: 5000 },
  { en: 'Second age change', ur: 'دوسری بار عمر کی تبدیلی', inland: 10000 },
]

export const CNIC = {
  asOf: '2026-09-17',
  deliveryPk: 165,
  officialUrl: 'https://www.nadra.gov.pk/feeStructure',
}

export const rsOrDash = (n: number | null) => (n === null ? '–' : n === 0 ? 'Free' : `Rs${n.toLocaleString('en-US')}`)

export function cnicFee(key: string): IdFee {
  const f = CNIC_FEES.find((x) => x.key === key)
  if (!f) throw new Error(`unknown fee ${key}`)
  return f
}
