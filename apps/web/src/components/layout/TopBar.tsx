import { CalendarDays } from 'lucide-react'
import Link from 'next/link'
import type { Locale, RateTick } from '@zaviya/shared'
import { NextPrayerPill } from '@/components/namaz/NextPrayerPill'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { formatNumber } from '@/lib/format'
import { localePath } from '@/lib/i18n'
import { PK_CITIES, prayerTimes, pktNow } from '@/lib/prayer-times'

function dates(locale: Locale) {
  const now = new Date()
  const greg = new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK' : 'en-GB', {
    timeZone: 'Asia/Karachi',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  const hijri = new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK-u-ca-islamic-umalqura' : 'en-GB-u-ca-islamic-umalqura', {
    timeZone: 'Asia/Karachi',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  return { greg, hijri }
}

/** Dark utility bar: dates, live rates, the next namaz and the language switch. */
export function TopBar({ locale, rates, langHref }: { locale: Locale; rates: RateTick[]; langHref: string }) {
  const { greg, hijri } = dates(locale)
  const now = pktNow()
  const city = PK_CITIES[0]!
  return (
    <div className="hidden bg-ink text-[13px] text-ink-muted md:block">
      <div className="container-wide flex h-10 items-center justify-between gap-6">
        <p className="flex shrink-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 text-emerald-300" aria-hidden />
          <span className="font-semibold text-ink-fg">{greg}</span>
          <span className="text-ink-line" aria-hidden>
            |
          </span>
          <span>{hijri}</span>
        </p>
        <div className="flex min-w-0 items-center gap-5">
          {rates.length > 0 && (
            <div className="no-scrollbar hidden min-w-0 items-center gap-5 overflow-x-auto lg:flex">
              {rates.map((r) => (
                <Link key={r.series} href={locale === 'ur' ? `/ur${r.href}` : r.href} className="flex shrink-0 items-center gap-1.5 hover:text-ink-fg">
                  <span>{r.label}</span>
                  <span dir="ltr" className="font-bold tabular-nums text-ink-fg">
                    {formatNumber(r.value)}
                  </span>
                  {r.change !== 0 && (
                    <span dir="ltr" className={r.change > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {r.change > 0 ? '▲' : '▼'}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
          <NextPrayerPill
            locale={locale}
            href={localePath(locale, '/namaz-timings')}
            cityName={locale === 'ur' ? city.ur : city.en}
            times={prayerTimes(city, now)}
            serverMinutes={now.minutes}
          />
          <LanguageSwitch locale={locale} href={langHref} className="border-ink-line text-ink-muted hover:text-ink-fg" />
        </div>
      </div>
    </div>
  )
}

export function RatesStripMobile({ locale, rates }: { locale: Locale; rates: RateTick[] }) {
  if (!rates.length) return null
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto bg-ink px-4 py-2.5 md:hidden">
      {rates.map((r) => (
        <Link
          key={r.series}
          href={locale === 'ur' ? `/ur${r.href}` : r.href}
          className="flex shrink-0 flex-col rounded-xl border border-ink-line bg-ink-2 px-3 py-1.5 text-xs"
        >
          <span className="font-bold text-ink-muted">{r.label}</span>
          <span dir="ltr" className="font-bold tabular-nums text-ink-fg">
            {formatNumber(r.value)}
          </span>
        </Link>
      ))}
    </div>
  )
}
