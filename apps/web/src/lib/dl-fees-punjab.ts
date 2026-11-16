/**
 * Punjab driving licence fees. Edit this file only; the page and the sitemap read it.
 * Copied by hand on 16 Nov 2026 from the Punjab government's DLIMS fee page (https://dlims.punjab.gov.pk/fee_structure)
 * and the learner fee from the DLIMS FAQ ("500 PKR for each category"). Official source only.
 * Search demand (Google autocomplete, PK): "driving licence fee in punjab", "driving licence fee in punjab 2026",
 * "driving licence fees in lahore", "driving licence fee for 5 years".
 * DLIMS says regular fees "are applicable for one year" and a licence can be made for 1 to 5 years; we do not
 * multiply for longer periods because DLIMS does not publish that total.
 */
export interface DlRow {
  key: string
  en: string
  ur: string
  test: number
  fee: number
}

export const COURIER = 480
export const LEARNER_FEE = 500

/** Regular licence, first issue: test fee + fee after passing the test (+ courier). */
export const REGULAR: DlRow[] = [
  { key: 'mcycle', en: 'Motorcycle', ur: 'موٹر سائیکل', test: 50, fee: 450 },
  { key: 'rickshaw', en: 'Rickshaw', ur: 'رکشہ', test: 100, fee: 400 },
  { key: 'car', en: 'Car / jeep', ur: 'کار / جیپ', test: 150, fee: 1350 },
  { key: 'mcycle-car', en: 'Motorcycle + car / jeep', ur: 'موٹر سائیکل + کار', test: 200, fee: 1350 },
  { key: 'ltv', en: 'LTV', ur: 'ایل ٹی وی', test: 150, fee: 1850 },
  { key: 'mcycle-ltv', en: 'Motorcycle + LTV', ur: 'موٹر سائیکل + ایل ٹی وی', test: 200, fee: 1850 },
  { key: 'tractor-agri', en: 'Tractor (agriculture)', ur: 'ٹریکٹر (زرعی)', test: 50, fee: 950 },
  { key: 'tractor-com', en: 'Tractor (commercial)', ur: 'ٹریکٹر (کمرشل)', test: 100, fee: 1400 },
  { key: 'invalid', en: 'Invalid carriage', ur: 'معذور افراد کی گاڑی', test: 0, fee: 0 },
]

/** Renewal for one year and the late fines DLIMS lists (courier extra). */
export const RENEWAL = [
  { en: 'Motorcycle', ur: 'موٹر سائیکل', fee: 450, fine3m: 225, fine1y: 450, fineOver1y: 1125 },
  { en: 'Rickshaw', ur: 'رکشہ', fee: 400, fine3m: 200, fine1y: 400, fineOver1y: 1000 },
  { en: 'Car / jeep', ur: 'کار / جیپ', fee: 1350, fine3m: 675, fine1y: 1350, fineOver1y: 3375 },
  { en: 'Motorcycle + car', ur: 'موٹر سائیکل + کار', fee: 1350, fine3m: 675, fine1y: 1350, fineOver1y: 3375 },
  { en: 'LTV, HTV or PSV', ur: 'ایل ٹی وی، ایچ ٹی وی یا پی ایس وی', fee: 1850, fine3m: 925, fine1y: 1850, fineOver1y: 4625 },
  { en: 'Tractor (commercial)', ur: 'ٹریکٹر (کمرشل)', fee: 1400, fine3m: 700, fine1y: 1400, fineOver1y: 3500 },
]

/** Duplicate (lost) licence fee, courier extra. */
export const DUPLICATE = [
  { en: 'Motorcycle or rickshaw', ur: 'موٹر سائیکل یا رکشہ', fee: 100 },
  { en: 'Car / jeep or LTV', ur: 'کار / جیپ یا ایل ٹی وی', fee: 150 },
  { en: 'Combined categories, HTV, PSV', ur: 'ملی جلی کیٹیگری، ایچ ٹی وی، پی ایس وی', fee: 200 },
]

export const DLIMS = {
  readOn: '2026-11-16',
  feeUrl: 'https://dlims.punjab.gov.pk/fee_structure',
  helpline: '042-99202892',
}

export const rs = (n: number) => (n === 0 ? 'Free' : `Rs${n.toLocaleString('en-US')}`)

export function regular(key: string): DlRow {
  const r = REGULAR.find((x) => x.key === key)
  if (!r) throw new Error(`unknown category ${key}`)
  return r
}
