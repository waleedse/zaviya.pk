/** "SAT 17 OCT · 6 JUMADA I" in Pakistan time, with the Umm al-Qura Hijri day and month (no year). */
export function formatDates(date: Date | string, tz = 'Asia/Karachi'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const g = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  const h = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: tz, day: 'numeric', month: 'long' })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {})
  return `${g.weekday} ${g.day} ${g.month} · ${h.day} ${h.month}`.toUpperCase()
}

/** "17 OCT" in Pakistan time. */
export function shortDate(date: Date | string, tz = 'Asia/Karachi'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(d).toUpperCase()
}
