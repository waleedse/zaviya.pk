import { CalendarDays, Compass, MoonStar } from 'lucide-react'
import Link from 'next/link'
import type { Locale } from '@zaviya/shared'
import { CityPicker } from '@/components/namaz/CityPicker'
import { NamazTimetable, type DayRow } from '@/components/namaz/NamazTimetable'
import { Tasbeeh } from '@/components/namaz/Tasbeeh'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { localePath } from '@/lib/i18n'
import { upcomingIslamicEvents } from '@/lib/islamic-calendar'
import { addDays, formatClock, PK_CITIES, pktNow, prayerTimes, qiblaBearing, type PkCity } from '@/lib/prayer-times'

export function namazPath(city?: PkCity) {
  return city && city.slug !== PK_CITIES[0]!.slug ? `/namaz-timings/${city.slug}` : '/namaz-timings'
}

export function namazSeo(city: PkCity, locale: Locale) {
  if (locale === 'ur') {
    return {
      title: `${city.ur} میں آج نماز کے اوقات: فجر، ظہر، عصر، مغرب، عشاء`,
      description: `آج ${city.ur} میں نماز کے اوقات، اگلی نماز کا وقت، ہفتہ وار ٹائم ٹیبل، حنفی اور شافعی عصر، اور قبلہ رخ۔`,
    }
  }
  return {
    title: `Namaz Timings in ${city.en} Today: Fajr, Dhuhr, Asr, Maghrib, Isha`,
    description: `Prayer times in ${city.en} today with a live countdown to the next namaz, the 7-day timetable, Hanafi and Shafi Asr, Qibla direction and upcoming Islamic dates.`,
  }
}

/** The whole namaz timings page for one city. */
export function NamazPageView({ locale, city }: { locale: Locale; city: PkCity }) {
  const isUr = locale === 'ur'
  const now = pktNow()
  const dayFmt = new Intl.DateTimeFormat(isUr ? 'ur-PK' : 'en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
  const days: DayRow[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(now, i)
    const iso = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
    return {
      iso,
      label: dayFmt.format(new Date(`${iso}T00:00:00Z`)),
      hanafi: prayerTimes(city, date, 'hanafi'),
      shafiAsr: prayerTimes(city, date, 'shafi').asr,
    }
  })
  const greg = new Intl.DateTimeFormat(isUr ? 'ur-PK' : 'en-GB', { timeZone: 'Asia/Karachi', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const hijri = new Intl.DateTimeFormat(isUr ? 'ur-PK-u-ca-islamic-umalqura' : 'en-GB-u-ca-islamic-umalqura', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const qibla = qiblaBearing(city)
  const events = upcomingIslamicEvents(now, 6)
  const cityName = isUr ? city.ur : city.en
  const today = days[0]!.hanafi
  const faqs = isUr
    ? [
        { q: `آج ${city.ur} میں فجر کا وقت کیا ہے؟`, a: `آج ${city.ur} میں فجر ${formatClock(today.fajr)} اور طلوع آفتاب ${formatClock(today.sunrise)} پر ہے۔` },
        { q: 'حنفی اور شافعی عصر میں کیا فرق ہے؟', a: 'حنفی طریقے میں عصر اس وقت شروع ہوتی ہے جب سایہ چیز سے دوگنا ہو جائے، شافعی میں جب برابر ہو۔ اس لیے شافعی عصر پہلے آتی ہے۔' },
      ]
    : [
        { q: `What time is Fajr in ${city.en} today?`, a: `Fajr in ${city.en} today begins at ${formatClock(today.fajr)}, and sunrise is at ${formatClock(today.sunrise)}.` },
        { q: `When is Maghrib (iftar time) in ${city.en} today?`, a: `Maghrib in ${city.en} is at ${formatClock(today.maghrib)} today. Isha follows at ${formatClock(today.isha)}.` },
        {
          q: 'Why is Asr different for Hanafi and Shafi?',
          a: 'Hanafi Asr starts when an object’s shadow is twice its length; Shafi, Maliki and Hanbali Asr starts when it equals its length, so it comes earlier. Most mosques in Pakistan follow the Hanafi time.',
        },
        { q: 'Which calculation method is used?', a: 'We use the University of Islamic Sciences, Karachi method (Fajr and Isha at 18°), which most Pakistani timetables follow. Times can differ from your local mosque by a few minutes.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'نماز کے اوقات' : 'Namaz timings', url: localePath(locale, '/namaz-timings') },
            { name: cityName, url: localePath(locale, namazPath(city)) },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <section className="relative overflow-hidden bg-[#0b2e2a] py-10 text-emerald-100 md:py-12">
        <div className="container-wide grid items-center gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <nav aria-label="Breadcrumb" className="text-sm text-emerald-300">
              <Link href={localePath(locale, '/')} className="hover:text-white">
                {isUr ? 'ہوم' : 'Home'}
              </Link>{' '}
              › {isUr ? 'نماز کے اوقات' : 'Namaz timings'}
            </nav>
            <h1 className="font-display text-[clamp(2.1rem,1.5rem+2vw,3.2rem)] font-extrabold leading-[1.05] text-white">
              {isUr ? `${city.ur} میں آج نماز کے اوقات` : `Namaz timings in ${city.en} today`}
            </h1>
            {!isUr && (
              <p lang="ur" dir="rtl" className="self-start font-urdu-sans text-xl leading-[1.8] text-emerald-200">
                آج {city.ur} میں نماز کے اوقات
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-[15px]">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#0f3d37] px-3.5 py-2">
                <CalendarDays className="h-4 w-4 text-emerald-300" aria-hidden />
                {greg}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#0f3d37] px-3.5 py-2">
                <MoonStar className="h-4 w-4 text-amber-300" aria-hidden />
                {hijri}
              </span>
            </div>
            <CityPicker
              locale={locale}
              current={city.slug}
              cities={PK_CITIES.map((c) => ({ slug: c.slug, en: c.en, ur: c.ur, href: localePath(locale, namazPath(c)) }))}
            />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG */}
          <img src="/illustrations/mosque.svg" alt="" width={800} height={450} className="hidden h-auto w-full rounded-3xl lg:block" />
        </div>
      </section>

      <div className="container-wide mt-8 space-y-8">
        <NamazTimetable locale={locale} cityName={cityName} days={days} serverMinutes={now.minutes} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section id="qibla" className="flex scroll-mt-40 flex-wrap items-center gap-6 rounded-[22px] border border-border bg-surface p-6">
            <svg width="160" height="160" viewBox="0 0 200 200" role="img" aria-label={`${isUr ? 'قبلہ' : 'Qibla'} ${qibla}°`}>
              <circle cx="100" cy="100" r="92" className="fill-surface-2 stroke-border" strokeWidth="2" />
              <circle cx="100" cy="100" r="70" fill="none" className="stroke-border" strokeWidth="1" strokeDasharray="3 6" />
              <text x="100" y="26" textAnchor="middle" fontSize="16" fontWeight="800" className="fill-fg">
                N
              </text>
              <text x="180" y="106" textAnchor="middle" fontSize="14" fontWeight="700" className="fill-fg-subtle">
                E
              </text>
              <text x="100" y="186" textAnchor="middle" fontSize="14" fontWeight="700" className="fill-fg-subtle">
                S
              </text>
              <text x="20" y="106" textAnchor="middle" fontSize="14" fontWeight="700" className="fill-fg-subtle">
                W
              </text>
              <g transform={`rotate(${qibla} 100 100)`}>
                <path d="M100 30 L110 100 L100 92 L90 100 Z" className="fill-accent" />
                <path d="M100 170 L110 100 L100 108 L90 100 Z" className="fill-border" />
                <rect x="91" y="16" width="18" height="18" rx="3" fill="#0b1220" />
                <rect x="91" y="20" width="18" height="4" fill="#fbbf24" />
              </g>
              <circle cx="100" cy="100" r="8" className="fill-surface stroke-accent" strokeWidth="4" />
            </svg>
            <div className="min-w-[180px] flex-1 space-y-1.5">
              <p className="eyebrow flex items-center gap-2 text-fg-subtle">
                <Compass className="h-4 w-4" aria-hidden />
                {isUr ? 'قبلہ رخ' : 'Qibla direction'}
              </p>
              <p className="font-display text-4xl font-extrabold tabular-nums">{qibla}°</p>
              <p className="text-fg-muted">
                {isUr ? `${city.ur} سے شمال کی طرف سے گھڑی کی سمت میں۔` : `Clockwise from true north in ${city.en}. Face this bearing on a compass to face the Kaaba.`}
              </p>
            </div>
          </section>
          <Tasbeeh locale={locale} />
        </div>

        <section id="islamic-dates" className="scroll-mt-40 rounded-[22px] border border-border bg-surface p-5 md:p-6">
          <h2 className="font-display text-2xl font-extrabold">{isUr ? 'آنے والی اسلامی تاریخیں' : 'Upcoming Islamic dates'}</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            {isUr ? 'متوقع تاریخیں۔ حتمی اعلان رویت ہلال کمیٹی کرے گی۔' : 'Expected dates from the Umm al-Qura calendar. The Ruet-e-Hilal Committee confirms the final date, which can differ by a day.'}
          </p>
          <ul className="mt-3 divide-y divide-border">
            {events.map((e) => {
              const date = new Date(`${e.date}T00:00:00Z`)
              return (
                <li key={e.date + e.en} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-4 py-3.5">
                  <span className="flex h-16 flex-col items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <b className="font-display text-2xl leading-none">{date.getUTCDate()}</b>
                    <span className="text-xs font-bold">{new Intl.DateTimeFormat(isUr ? 'ur-PK' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(date)}</span>
                  </span>
                  <span>
                    <b className="block text-[17px]">{isUr ? e.ur : e.en}</b>
                    <span className="text-sm text-fg-subtle">{e.hijri}</span>
                  </span>
                  <span className="whitespace-nowrap rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-extrabold text-accent">
                    {isUr ? `${e.daysAway} دن بعد` : `in ${e.daysAway} days`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="max-w-[860px]">
          <FAQAccordion faqs={faqs} locale={locale} />
        </div>

        <section>
          <h2 className="mb-3 font-display text-xl font-extrabold">{isUr ? 'دوسرے شہروں کے اوقات' : 'Namaz timings in other cities'}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {PK_CITIES.filter((c) => c.slug !== city.slug).map((c) => {
              const t = prayerTimes(c, now)
              return (
                <Link key={c.slug} href={localePath(locale, namazPath(c))} className="card-lift p-3.5">
                  <b className="block">{isUr ? c.ur : c.en}</b>
                  <span className="text-[13px] text-fg-subtle">
                    {isUr ? 'مغرب' : 'Maghrib'} {formatClock(t.maghrib)}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
