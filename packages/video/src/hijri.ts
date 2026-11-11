/**
 * Pakistan's Ruet-e-Hilal committee usually starts each month one day after Umm al-Qura
 * (e.g. Jumada II 1448: Umm al-Qura 11 Nov 2026, Pakistan 12 Nov). Shift by this many days.
 */
export const PK_HIJRI_OFFSET_DAYS = -1

/** "SAT 17 OCT · 5 JUMADA I" in Pakistan time, with the Pakistan Hijri day and month (no year). */
export function formatDates(date: Date | string, tz = 'Asia/Karachi'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const hd = new Date(d.getTime() + PK_HIJRI_OFFSET_DAYS * 86_400_000)
  const g = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  const h = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: tz, day: 'numeric', month: 'long' })
    .formatToParts(hd)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  return `${g.weekday} ${g.day} ${g.month} · ${h.day} ${h.month}`.toUpperCase()
}

/** "17 OCT" in Pakistan time. */
export function shortDate(date: Date | string, tz = 'Asia/Karachi'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(d).toUpperCase()
}
