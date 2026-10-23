/**
 * Turns written Urdu (with digits, money, percentages, times and a few English terms) into text the Urdu voice
 * model can read. The voice (Matcha-TTS, Urdu graphemes) only knows Urdu letters and a little punctuation:
 * digits and Latin letters would be dropped or turned into silence, so everything is spelled out first.
 * Pure and deterministic; unit-tested.
 */

const ONES = [
  'صفر', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو', 'دس',
  'گیارہ', 'بارہ', 'تیرہ', 'چودہ', 'پندرہ', 'سولہ', 'سترہ', 'اٹھارہ', 'انیس', 'بیس',
  'اکیس', 'بائیس', 'تئیس', 'چوبیس', 'پچیس', 'چھبیس', 'ستائیس', 'اٹھائیس', 'انتیس', 'تیس',
  'اکتیس', 'بتیس', 'تینتیس', 'چونتیس', 'پینتیس', 'چھتیس', 'سینتیس', 'اڑتیس', 'انتالیس', 'چالیس',
  'اکتالیس', 'بیالیس', 'تینتالیس', 'چوالیس', 'پینتالیس', 'چھیالیس', 'سینتالیس', 'اڑتالیس', 'انچاس', 'پچاس',
  'اکاون', 'باون', 'ترپن', 'چون', 'پچپن', 'چھپن', 'ستاون', 'اٹھاون', 'انسٹھ', 'ساٹھ',
  'اکسٹھ', 'باسٹھ', 'ترسٹھ', 'چونسٹھ', 'پینسٹھ', 'چھیاسٹھ', 'سڑسٹھ', 'اڑسٹھ', 'انہتر', 'ستر',
  'اکہتر', 'بہتر', 'تہتر', 'چوہتر', 'پچھتر', 'چھہتر', 'ستتر', 'اٹھہتر', 'اناسی', 'اسی',
  'اکیاسی', 'بیاسی', 'تراسی', 'چوراسی', 'پچاسی', 'چھیاسی', 'ستاسی', 'اٹھاسی', 'نواسی', 'نوے',
  'اکانوے', 'بانوے', 'ترانوے', 'چورانوے', 'پچانوے', 'چھیانوے', 'ستانوے', 'اٹھانوے', 'ننانوے',
] as const

const DIGITS = '0123456789'
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'

/** Latin digits for every digit script Urdu text may contain. */
export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => {
    const i = ARABIC_INDIC.indexOf(c)
    return DIGITS[i >= 0 ? i : PERSIAN.indexOf(c)]!
  })
}

/** 0 to 99,99,99,99,99,999 in Urdu words (hundred, thousand, lakh, crore, arab, kharab). */
export function numberToUrdu(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new RangeError('numberToUrdu needs a non-negative finite number')
  n = Math.floor(n)
  if (n < 100) return ONES[n]!
  const parts: string[] = []
  const units: [number, string][] = [
    [100_00_00_00_000, 'کھرب'],
    [100_00_00_000, 'ارب'],
    [100_00_000, 'کروڑ'],
    [100_000, 'لاکھ'],
    [1000, 'ہزار'],
    [100, 'سو'],
  ]
  let rest = n
  for (const [size, word] of units) {
    if (rest >= size) {
      const q = Math.floor(rest / size)
      parts.push(`${numberToUrdu(q)} ${word}`)
      rest -= q * size
    }
  }
  if (rest > 0) parts.push(ONES[rest]!)
  return parts.join(' ')
}

/** "5.40" -> "پانچ اعشاریہ چار صفر": the digits after the point are read one by one. */
function decimalToUrdu(whole: string, frac: string): string {
  const w = numberToUrdu(Number(whole))
  return `${w} اعشاریہ ${[...frac].map((d) => ONES[Number(d)]).join(' ')}`
}

const SCALE: Record<string, string> = {
  k: 'ہزار', m: 'ملین', mn: 'ملین', b: 'ارب', bn: 'ارب', t: 'ٹریلین', tn: 'ٹریلین',
  lakh: 'لاکھ', crore: 'کروڑ', arab: 'ارب',
}

const CURRENCY: Record<string, string> = { rs: 'روپے', pkr: 'روپے', '₨': 'روپے', '$': 'ڈالر', usd: 'ڈالر', '€': 'یورو', '£': 'پاؤنڈ' }

/** Terms and acronyms that appear in Pakistani news; anything else in ALL CAPS is spelled letter by letter. */
export const TERMS: Record<string, string> = {
  AI: 'اے آئی', PHP: 'پی ایچ پی', IMF: 'آئی ایم ایف', SBP: 'ایس بی پی', PSX: 'پی ایس ایکس', OGRA: 'اوگرا',
  FBR: 'ایف بی آر', NADRA: 'نادرا', PTA: 'پی ٹی اے', NASA: 'ناسا', GPS: 'جی پی ایس', OTP: 'او ٹی پی', SMS: 'ایس ایم ایس',
  CNIC: 'شناختی کارڈ', PM: 'وزیر اعظم', USA: 'امریکا', UK: 'برطانیہ', UAE: 'متحدہ عرب امارات', EU: 'یورپی یونین',
  OpenAI: 'اوپن اے آئی', ChatGPT: 'چیٹ جی پی ٹی', Google: 'گوگل', WhatsApp: 'واٹس ایپ', Facebook: 'فیس بک', Instagram: 'انسٹاگرام',
  YouTube: 'یوٹیوب', Zaviya: 'زاویہ', Starlink: 'اسٹار لنک', SpaceX: 'اسپیس ایکس', Tesla: 'ٹیسلا', Microsoft: 'مائیکروسافٹ',
  Apple: 'ایپل', Samsung: 'سام سنگ', internet: 'انٹرنیٹ', Internet: 'انٹرنیٹ', online: 'آن لائن', Online: 'آن لائن',
  WiFi: 'وائی فائی', 'Wi-Fi': 'وائی فائی', app: 'ایپ', App: 'ایپ', link: 'لنک', Link: 'لنک', password: 'پاس ورڈ', Password: 'پاس ورڈ',
  email: 'ای میل', Email: 'ای میل', website: 'ویب سائٹ', Website: 'ویب سائٹ', 'zaviya.pk': 'زاویہ ڈاٹ پی کے',
}

const LETTERS: Record<string, string> = {
  A: 'اے', B: 'بی', C: 'سی', D: 'ڈی', E: 'ای', F: 'ایف', G: 'جی', H: 'ایچ', I: 'آئی', J: 'جے', K: 'کے', L: 'ایل', M: 'ایم',
  N: 'این', O: 'او', P: 'پی', Q: 'کیو', R: 'آر', S: 'ایس', T: 'ٹی', U: 'یو', V: 'وی', W: 'ڈبلیو', X: 'ایکس', Y: 'وائی', Z: 'زیڈ',
}

function spellAcronym(s: string): string {
  return [...s].map((c) => LETTERS[c] ?? c).join(' ')
}

function timeToUrdu(h: number, m: number): string {
  const hour = numberToUrdu(h)
  return m === 0 ? `${hour} بجے` : `${hour} بج کر ${numberToUrdu(m)} منٹ`
}

export interface SpeechText {
  text: string
  /** Latin words that could not be spelled out: the voice would skip them, so the script must be fixed. */
  unresolved: string[]
}

/** The text the voice reads, plus the English words nobody could turn into Urdu. */
export function toSpeechText(input: string): SpeechText {
  let t = toLatinDigits(input).normalize('NFC')
  const unresolved: string[] = []

  // zaviya.pk and other known multi-character terms first
  t = t.replace(/zaviya\.pk/gi, ' زاویہ ڈاٹ پی کے ')

  // times 14:32
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => ` ${timeToUrdu(Number(h), Number(m))} `)

  // percentages 22% / 22.5%
  t = t.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, n: string) => {
    const [w, f] = n.split('.')
    return ` ${f ? decimalToUrdu(w!, f) : numberToUrdu(Number(w))} فیصد `
  })

  // money: Rs5.40, Rs 4,500, $30B, $1.25T, PKR 12m
  t = t.replace(/(rs\.?|pkr|usd|\$|€|£|₨)\s?(\d[\d,]*(?:\.\d+)?)\s?(k|mn|m|bn|b|tn|t|lakh|crore|arab)?\b/gi, (_, cur: string, num: string, scale?: string) => {
    const word = CURRENCY[cur.toLowerCase().replace('.', '')] ?? ''
    const clean = num.replace(/,/g, '')
    const [w, f] = clean.split('.')
    const sc = scale ? SCALE[scale.toLowerCase()] : undefined
    if (sc) return ` ${f ? decimalToUrdu(w!, f) : numberToUrdu(Number(w))} ${sc} ${word} `
    if (f && word === 'روپے') {
      const paisa = Number(f.padEnd(2, '0').slice(0, 2))
      return ` ${numberToUrdu(Number(w))} ${word}${paisa ? ` ${numberToUrdu(paisa)} پیسے` : ''} `
    }
    return ` ${f ? decimalToUrdu(w!, f) : numberToUrdu(Number(w))} ${word} `
  })

  // numbers with a unit word glued on (30B, 5G, 2kg) and plain numbers
  t = t.replace(/(\d[\d,]*)(\.\d+)?/g, (_, whole: string, frac?: string) => {
    const w = whole.replace(/,/g, '')
    return ` ${frac ? decimalToUrdu(w, frac.slice(1)) : numberToUrdu(Number(w))} `
  })

  // known terms (longest first), then acronyms, then report what is left
  const terms = Object.keys(TERMS).sort((a, b) => b.length - a.length)
  for (const k of terms) {
    t = t.replace(new RegExp(`(?<![A-Za-z])${k.replace(/[-.]/g, '\\$&')}(?![A-Za-z])`, 'g'), ` ${TERMS[k]} `)
  }
  t = t.replace(/(?<![A-Za-z])[A-Z]{2,6}(?![A-Za-z])/g, (m) => ` ${spellAcronym(m)} `)
  t = t.replace(/[A-Za-z][A-Za-z'’-]*/g, (m) => {
    unresolved.push(m)
    return ' '
  })

  // punctuation the voice understands: Urdu comma, full stop, question mark
  t = t
    .replace(/[“”"«»()[\]{}<>*_#@|\\/~^`]/g, ' ')
    .replace(/[‘’']/g, '')
    .replace(/[–—-]/g, ' ')
    .replace(/,/g, '،')
    .replace(/\?/g, '؟')
    .replace(/[.!]+/g, '۔')
    .replace(/;/g, '،')
    .replace(/[^؀-ۿݐ-ݿ\s۔،؟:]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([۔،؟:])/g, '$1')
    .trim()

  return { text: t, unresolved: [...new Set(unresolved)] }
}

/** Sentences for the voice (one at a time works best): split after «۔» and «؟», keep very short ones joined to the next. */
export function speechSentences(text: string, minChars = 12): string[] {
  const raw = text.split(/(?<=[۔؟])\s*/).map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const s of raw) {
    const last = out[out.length - 1]
    if (last !== undefined && last.length < minChars) out[out.length - 1] = `${last} ${s}`
    else out.push(s)
  }
  return out
}
