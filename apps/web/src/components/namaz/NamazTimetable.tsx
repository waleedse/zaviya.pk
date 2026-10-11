'use client'

import { MoonStar, Sun, Sunrise, Sunset } from 'lucide-react'
import { useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'
import { formatClock, formatDuration, nextPrayer, PRAYER_KEYS, PRAYER_NAMES, type AsrMethod, type PrayerKey } from '@/lib/prayer-times'
import { usePktMinutes } from '@/components/namaz/NamazWidget'

export interface DayRow {
  label: string
  iso: string
  hanafi: Record<PrayerKey, number>
  shafiAsr: number
}

const ICONS: Record<PrayerKey, typeof Sun> = { fajr: Sunrise, sunrise: Sunrise, dhuhr: Sun, asr: Sun, maghrib: Sunset, isha: MoonStar }

/** Today's six times, the countdown ring and the 7-day table, with a Hanafi / Shafi switch for Asr. */
export function NamazTimetable({ locale, cityName, days, serverMinutes }: { locale: Locale; cityName: string; days: DayRow[]; serverMinutes: number }) {
  const isUr = locale === 'ur'
  const [method, setMethod] = useState<AsrMethod>('hanafi')
  const now = usePktMinutes(serverMinutes)
  const withMethod = (row: DayRow) => (method === 'shafi' ? { ...row.hanafi, asr: row.shafiAsr } : row.hanafi)
  const today = withMethod(days[0]!)
  const next = nextPrayer(today, now)
  const circ = 2 * Math.PI * 34

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-border bg-surface p-5 md:p-6">
        <div className="flex items-center gap-5">
          <svg width="84" height="84" viewBox="0 0 80 80" role="img" aria-label={`${next.progress}%`}>
            <circle cx="40" cy="40" r="34" fill="none" strokeWidth="8" className="stroke-accent-soft" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className="stroke-accent transition-[stroke-dasharray] duration-700"
              strokeDasharray={`${(circ * next.progress) / 100} ${circ}`}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div>
            <p className="eyebrow text-accent">
              {isUr ? 'اگلی نماز' : 'Next prayer'} · {PRAYER_NAMES[next.key][locale]}
            </p>
            <p dir="ltr" className="font-display text-[2.6rem] font-extrabold leading-none tabular-nums rtl:text-end">
              {formatClock(today[next.key])}
            </p>
            <p className="mt-1 text-fg-muted">
              {isUr ? 'باقی وقت' : 'Starts in'} <b className="text-fg">{formatDuration(next.minutesLeft, locale)}</b> · {cityName}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm font-semibold text-fg-muted">{isUr ? 'عصر کا طریقہ' : 'Asr method'}</span>
          <div role="radiogroup" aria-label={isUr ? 'عصر کا طریقہ' : 'Asr method'} className="inline-flex rounded-xl bg-surface-2 p-1">
            {(
              [
                ['hanafi', isUr ? 'حنفی' : 'Hanafi'],
                ['shafi', isUr ? 'شافعی / دیگر' : 'Shafi / others'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={method === key}
                onClick={() => setMethod(key)}
                className={cn('h-10 rounded-lg px-4 text-sm font-bold transition-colors', method === key ? 'bg-surface text-accent shadow-sm' : 'text-fg-muted hover:text-fg')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PRAYER_KEYS.map((k) => {
          const Icon = ICONS[k]
          const isNext = k === next.key
          const passed = !isNext && today[k] <= now
          return (
            <div
              key={k}
              className={cn(
                'flex flex-col gap-3 rounded-[20px] border p-4 transition-shadow',
                isNext ? 'border-accent bg-accent text-accent-fg shadow-[0_18px_36px_-18px_rgb(4_120_87/0.7)]' : 'border-border bg-surface',
                passed && 'text-fg-subtle',
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn('icon-tile h-10 w-10', isNext ? 'bg-white/15 text-amber-300' : passed ? 'bg-surface-2 text-fg-subtle' : 'bg-accent-soft text-accent')}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-extrabold',
                    isNext ? 'bg-amber-400 text-[#0b1220]' : passed ? 'bg-surface-2 text-fg-subtle' : 'bg-accent-soft text-accent',
                  )}
                >
                  {isNext ? formatDuration(next.minutesLeft, locale) : passed ? (isUr ? 'ادا' : 'Done') : isUr ? 'بعد میں' : 'Later'}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-lg">{PRAYER_NAMES[k].en}</b>
                <span lang="ur" className="font-urdu-sans text-base leading-[1.5] opacity-80">
                  {PRAYER_NAMES[k].ur}
                </span>
              </div>
              <p dir="ltr" className="font-display text-[1.9rem] font-extrabold leading-none tabular-nums rtl:text-end">
                {formatClock(today[k])}
              </p>
            </div>
          )
        })}
      </div>

      <section className="rounded-[22px] border border-border bg-surface p-5 md:p-6">
        <h2 className="mb-4 font-display text-2xl font-extrabold">{isUr ? `اس ہفتے ${cityName} میں` : `This week in ${cityName}`}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[15px]">
            <thead>
              <tr className="text-start text-xs uppercase tracking-[0.08em] text-fg-subtle">
                <th className="px-3 py-2.5 text-start">{isUr ? 'تاریخ' : 'Date'}</th>
                {PRAYER_KEYS.map((k) => (
                  <th key={k} className="px-3 py-2.5 text-start">
                    {PRAYER_NAMES[k][locale]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((row, i) => {
                const t = withMethod(row)
                const friday = new Date(row.iso).getUTCDay() === 5
                return (
                  <tr key={row.iso} className={cn('border-t border-border', i === 0 && 'bg-accent-soft font-bold text-accent', friday && i !== 0 && 'bg-amber-soft')}>
                    <td className="whitespace-nowrap px-3 py-3 font-bold">{row.label}</td>
                    {PRAYER_KEYS.map((k) => (
                      <td key={k} dir="ltr" className="px-3 py-3 tabular-nums rtl:text-end">
                        {formatClock(t[k])}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-fg-subtle">
          {isUr
            ? 'اوقات کراچی یونیورسٹی کے طریقے (فجر و عشاء 18°) سے حساب کیے گئے ہیں۔ اپنی مقامی مسجد سے تصدیق کر لیں۔'
            : 'Calculated with the University of Islamic Sciences, Karachi method (Fajr and Isha at 18°). Fridays are highlighted. Confirm with your local mosque.'}
        </p>
      </section>
    </div>
  )
}
