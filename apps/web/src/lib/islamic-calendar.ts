/**
 * Upcoming Islamic dates from the Umm al-Qura calendar built into Intl.
 * Pakistan's Ruet-e-Hilal committee can differ by a day, so pages label these "expected".
 */

const EVENTS: { month: number; day: number; en: string; ur: string }[] = [
  { month: 1, day: 1, en: 'Islamic New Year', ur: 'اسلامی نیا سال' },
  { month: 1, day: 10, en: 'Ashura', ur: 'عاشورہ' },
  { month: 3, day: 12, en: 'Eid Milad-un-Nabi', ur: 'عید میلاد النبی' },
  { month: 7, day: 1, en: 'Start of Rajab', ur: 'آغاز رجب' },
  { month: 7, day: 27, en: 'Shab-e-Meraj', ur: 'شب معراج' },
  { month: 8, day: 15, en: 'Shab-e-Barat', ur: 'شب برات' },
  { month: 9, day: 1, en: 'Ramadan begins', ur: 'رمضان کا آغاز' },
  { month: 9, day: 27, en: 'Laylat-ul-Qadr (27th night)', ur: 'لیلۃ القدر (27ویں شب)' },
  { month: 10, day: 1, en: 'Eid ul-Fitr', ur: 'عید الفطر' },
  { month: 12, day: 9, en: 'Day of Arafah', ur: 'یوم عرفہ' },
  { month: 12, day: 10, en: 'Eid ul-Adha', ur: 'عید الاضحیٰ' },
]

const hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' })

function hijriParts(date: Date) {
  const parts = hijriFmt.formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value?.replace(/\D/g, '') ?? 0)
  return { day: get('day'), month: get('month'), year: get('year') }
}

export interface IslamicEvent {
  en: string
  ur: string
  date: string
  daysAway: number
  hijri: string
}

export function upcomingIslamicEvents(from: { y: number; m: number; d: number }, limit = 6): IslamicEvent[] {
  const out: IslamicEvent[] = []
  const hijriLabel = new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  for (let i = 1; i <= 400 && out.length < limit; i++) {
    const date = new Date(Date.UTC(from.y, from.m - 1, from.d + i))
    const h = hijriParts(date)
    const ev = EVENTS.find((e) => e.month === h.month && e.day === h.day)
    if (ev) {
      out.push({ en: ev.en, ur: ev.ur, date: date.toISOString().slice(0, 10), daysAway: i, hijri: hijriLabel.format(date) })
    }
  }
  return out
}
