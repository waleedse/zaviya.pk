'use client'

import { MoonStar } from 'lucide-react'
import Link from 'next/link'
import type { Locale } from '@zaviya/shared'
import { formatClock, formatDuration, nextPrayer, PRAYER_NAMES } from '@/lib/prayer-times'
import { useSavedCity, usePktMinutes, type CityTimes } from '@/components/namaz/NamazWidget'

/** Compact sidebar card: the next prayer in the reader's saved city. */
export function NextPrayerCard({ locale, cities, serverMinutes, href }: { locale: Locale; cities: CityTimes[]; serverMinutes: number; href: string }) {
  const [slug] = useSavedCity(cities[0]!.slug, cities.map((c) => c.slug))
  const now = usePktMinutes(serverMinutes)
  const city = cities.find((c) => c.slug === slug) ?? cities[0]!
  const next = nextPrayer(city.times, now)
  const isUr = locale === 'ur'
  return (
    <Link href={href} className="card-lift flex items-center gap-4 border-accent-line bg-accent-soft p-4">
      <span className="icon-tile h-12 w-12 rounded-2xl bg-accent text-accent-fg">
        <MoonStar className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-accent">
          {isUr ? 'اگلی نماز' : 'Next prayer'} · {isUr ? city.ur : city.en}
        </span>
        <span className="block font-display text-[1.35rem] font-extrabold">
          {PRAYER_NAMES[next.key][locale]} <span dir="ltr">{formatClock(city.times[next.key])}</span>
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-extrabold text-accent">{formatDuration(next.minutesLeft, locale)}</span>
    </Link>
  )
}
