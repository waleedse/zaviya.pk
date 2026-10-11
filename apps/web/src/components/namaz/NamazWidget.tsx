'use client'

import { ArrowRight, MoonStar, Sun, Sunrise, Sunset } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'
import { formatClock, formatDuration, nextPrayer, pktNow, PRAYER_KEYS, PRAYER_NAMES, type PrayerKey } from '@/lib/prayer-times'

export interface CityTimes {
  slug: string
  en: string
  ur: string
  times: Record<PrayerKey, number>
}

const ICONS: Record<PrayerKey, typeof Sun> = { fajr: Sunrise, sunrise: Sunrise, dhuhr: Sun, asr: Sun, maghrib: Sunset, isha: MoonStar }
const STORAGE_KEY = 'zv-namaz-city'

/** Remembers the reader's city in this browser only. */
export function useSavedCity(fallback: string, valid: string[]) {
  const [city, setCity] = useState(fallback)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && valid.includes(saved)) setCity(saved)
    } catch {}
    // valid is a static list from the server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const choose = (slug: string) => {
    setCity(slug)
    try {
      localStorage.setItem(STORAGE_KEY, slug)
    } catch {}
  }
  return [city, choose] as const
}

export function usePktMinutes(serverMinutes: number) {
  const [now, setNow] = useState(serverMinutes)
  useEffect(() => {
    const tick = () => setNow(pktNow().minutes)
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** Dark "Your day" card: city pills, countdown to the next prayer and today's six times. */
export function NamazWidget({ locale, cities, serverMinutes, href }: { locale: Locale; cities: CityTimes[]; serverMinutes: number; href: string }) {
  const isUr = locale === 'ur'
  const [slug, setSlug] = useSavedCity(cities[0]!.slug, cities.map((c) => c.slug))
  const now = usePktMinutes(serverMinutes)
  const city = cities.find((c) => c.slug === slug) ?? cities[0]!
  const next = nextPrayer(city.times, now)

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 rounded-[22px] border border-ink-line bg-ink-2 p-5 text-ink-muted md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-sans text-[17px] font-extrabold text-ink-fg">
          <span className="icon-tile h-9 w-9 bg-emerald-950 text-emerald-300">
            <MoonStar className="h-[18px] w-[18px]" aria-hidden />
          </span>
          {isUr ? 'نماز کے اوقات' : 'Namaz timings'}
        </h3>
        {!isUr && <span className="font-urdu-sans text-sm leading-[1.4] text-ink-muted">نماز کے اوقات</span>}
      </div>

      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="radiogroup" aria-label={isUr ? 'شہر منتخب کریں' : 'Choose city'}>
        {cities.slice(0, 8).map((c) => (
          <button
            key={c.slug}
            type="button"
            role="radio"
            aria-checked={c.slug === city.slug}
            onClick={() => setSlug(c.slug)}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-bold transition-colors',
              c.slug === city.slug ? 'border-emerald-400 bg-emerald-400 text-emerald-950' : 'border-ink-line text-slate-300 hover:border-emerald-700',
            )}
          >
            {isUr ? c.ur : c.en}
          </button>
        ))}
      </div>

      <div className="space-y-2.5 rounded-2xl bg-emerald-950 px-4 py-4">
        <div className="flex items-baseline justify-between gap-2 text-[13px] text-emerald-200">
          <span className="font-bold uppercase tracking-[0.1em] rtl:tracking-normal">
            {isUr ? 'اگلی' : 'Next'} · {PRAYER_NAMES[next.key][locale]}
          </span>
          <span>
            {isUr ? 'باقی' : 'in'} <b className="text-[15px] text-white">{formatDuration(next.minutesLeft, locale)}</b>
          </span>
        </div>
        <p dir="ltr" className="font-display text-[2.5rem] font-extrabold leading-none text-white tabular-nums rtl:text-end">
          {formatClock(city.times[next.key])}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-emerald-900" aria-hidden>
          <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-700" style={{ width: `${next.progress}%` }} />
        </div>
      </div>

      <ul className="space-y-1">
        {PRAYER_KEYS.map((k) => {
          const Icon = ICONS[k]
          const isNext = k === next.key
          const passed = !isNext && city.times[k] <= now
          return (
            <li
              key={k}
              className={cn(
                'flex items-center justify-between rounded-xl px-3 py-2 text-[15px]',
                isNext ? 'bg-white font-bold text-emerald-900' : passed ? 'text-slate-500' : 'text-slate-200',
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" aria-hidden />
                {PRAYER_NAMES[k][locale]}
              </span>
              <span dir="ltr" className="font-bold tabular-nums">
                {formatClock(city.times[k])}
              </span>
            </li>
          )
        })}
      </ul>

      <Link href={href} className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-emerald-300 hover:text-emerald-200">
        {isUr ? 'مہینے کا ٹائم ٹیبل اور قبلہ' : 'Full timetable & Qibla'}
        <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  )
}
