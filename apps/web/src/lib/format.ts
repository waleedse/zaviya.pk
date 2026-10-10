import { SITE, type Locale } from '@zaviya/shared'

const TZ = SITE.timezone

const urMonths = [
  'جنوری',
  'فروری',
  'مارچ',
  'اپریل',
  'مئی',
  'جون',
  'جولائی',
  'اگست',
  'ستمبر',
  'اکتوبر',
  'نومبر',
  'دسمبر',
] as const

function fixUrMonth(m: string, locale: Locale): string {
  if (locale !== 'ur') return m
  const en = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const idx = en.indexOf(m)
  return idx >= 0 ? urMonths[idx]! : m
}

export function formatDateTime(iso: string, locale: Locale, opts?: { dateStyle?: 'medium' | 'long'; time?: boolean }) {
  const d = new Date(iso)
  const dateStyle = opts?.dateStyle ?? 'long'
  const formatted = new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', {
    timeZone: TZ,
    dateStyle,
    ...(opts?.time !== false ? { timeStyle: 'short' } : {}),
  }).format(d)
  if (locale === 'ur') {
    return formatted.replace(/October|September|August|July|June|May|April|March|February|January|November|December/g, (m) =>
      fixUrMonth(m, locale),
    )
  }
  return formatted
}

export function formatDateHeading(iso: string, locale: Locale): string {
  return formatDateTime(iso, locale, { dateStyle: 'long', time: false })
}

export function formatPktTime(iso: string, locale: Locale): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

export function timeAgo(iso: string, locale: Locale, now = Date.now()): string {
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffDay >= 1) return formatDateTime(iso, locale, { dateStyle: 'medium', time: diffDay < 2 })

  if (locale === 'ur') {
    if (diffMin < 1) return 'ابھی'
    if (diffMin < 60) return `${diffMin} منٹ پہلے`
    return `${diffHr} گھنٹے پہلے`
  }

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} min ago`
  return `${diffHr} hr ago`
}

export function formatNumber(n: number, locale: Locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'ur' ? 'en-PK' : 'en-PK', { maximumFractionDigits: 2 }).format(n)
}

export function formatCurrency(n: number, unit = 'PKR'): string {
  return `${formatNumber(n)} ${unit}`
}

export function formatChange(change: number, changePct: number, locale: Locale): { text: string; up: boolean } {
  const up = change >= 0
  const arrow = up ? '▲' : '▼'
  const sign = up ? '+' : ''
  const text =
    locale === 'ur'
      ? `${arrow} ${sign}${formatNumber(change)} (${sign}${changePct.toFixed(2)}%)`
      : `${arrow} ${sign}${formatNumber(change)} (${sign}${changePct.toFixed(2)}%)`
  return { text, up }
}

export function todayPktDate(locale: Locale): string {
  return formatDateHeading(new Date().toISOString(), locale)
}
