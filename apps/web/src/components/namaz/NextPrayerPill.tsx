'use client'

import { MoonStar } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { formatClock, nextPrayer, pktNow, PRAYER_NAMES, type PrayerKey } from '@/lib/prayer-times'

/** "Next: Asr 4:31 PM" in the top bar. Server renders it once; the browser keeps it current. */
export function NextPrayerPill({
  locale,
  href,
  cityName,
  times,
  serverMinutes,
}: {
  locale: Locale
  href: string
  cityName: string
  times: Record<PrayerKey, number>
  serverMinutes: number
}) {
  const [now, setNow] = useState(serverMinutes)
  useEffect(() => {
    const tick = () => setNow(pktNow().minutes)
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  const next = nextPrayer(times, now)
  const isUr = locale === 'ur'
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-full bg-ink-2 px-3 py-1 text-ink-fg transition-colors hover:bg-ink-line">
      <MoonStar className="h-3.5 w-3.5 text-amber-300" aria-hidden />
      <span>
        {isUr ? 'اگلی نماز' : 'Next'}: <b>{PRAYER_NAMES[next.key][locale]}</b> {formatClock(times[next.key], locale)}
      </span>
      <span className="text-ink-muted">· {cityName}</span>
    </Link>
  )
}
