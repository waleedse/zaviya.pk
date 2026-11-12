import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import type { Locale } from '@zaviya/shared'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { PK_CITIES, type PkCity } from '@/lib/prayer-times'
import {
  addDays, conditionFor, dayFor, fogLabel, fogLevel, pktToday, rainLabel, shortDate, weekday,
  type CityWeather, type WeatherDay,
} from '@/lib/weather'

const CREDIT_URL = 'https://open-meteo.com/'
/** Official warnings and bulletins: linked only, never read by us (their site blocks automated readers) */
const PMD_URL = 'https://pmd.gov.pk'

export function weatherCitySeo(city: PkCity, locale: Locale, now: Date = new Date()) {
  const tom = shortDate(addDays(pktToday(now), 1), locale === 'ur')
  return locale === 'ur'
    ? {
        title: `کل ${city.ur} کا موسم: بارش، دھند اور درجہ حرارت (${tom})`,
        description: `${city.ur} میں کل کا موسم: کم از کم اور زیادہ سے زیادہ درجہ حرارت، بارش کا امکان، دھند اور ہوا، اور اگلے 10 دن کی پیشگوئی۔`,
      }
    : {
        title: `Weather Tomorrow in ${city.en}: Rain, Fog and Temperature (${tom})`,
        description: `Weather tomorrow in ${city.en}: minimum and maximum temperature, chance of rain, morning fog and wind, plus the 10-day forecast.`,
      }
}

export function weatherHubSeo(locale: Locale, now: Date = new Date()) {
  const tom = shortDate(addDays(pktToday(now), 1), locale === 'ur')
  return locale === 'ur'
    ? {
        title: `کل کا موسم پاکستان: لاہور، کراچی، اسلام آباد (${tom})`,
        description: 'پاکستان کے بڑے شہروں میں کل کا موسم: بارش، دھند اور درجہ حرارت، اور ہر شہر کی 10 دن کی پیشگوئی۔',
      }
    : {
        title: `Weather Tomorrow in Pakistan: Karachi Weather, Lahore Weather Tomorrow (${tom})`,
        description: 'Weather tomorrow in Pakistan, city by city: Karachi weather, Lahore weather tomorrow, Islamabad and more. Temperature, rain and fog from the Open-Meteo model, with a 10-day forecast and a link to PMD for official warnings.',
      }
}

const cityPath = (slug: string) => `/weather/${slug}`

function Unavailable({ isUr }: { isUr: boolean }) {
  return (
    <p className="text-lg text-fg-muted">
      {isUr ? 'موسم کا ڈیٹا فی الحال دستیاب نہیں۔ کچھ دیر بعد دیکھیں۔' : 'Weather data is temporarily unavailable. Please check again shortly.'}
    </p>
  )
}

function Credit({ isUr }: { isUr: boolean }) {
  return (
    <p className="mt-3 text-sm text-fg-muted">
      {isUr ? 'موسمی ڈیٹا: ' : 'Weather data: '}
      <a href={CREDIT_URL} rel="noopener" className="underline">Open-Meteo</a>
      {isUr ? ' (CC BY 4.0)، تقریباً ہر 30 منٹ بعد اپ ڈیٹ۔ یہ ماڈل کی پیشگوئی ہے، محکمہ موسمیات کی نہیں۔ سرکاری وارننگز کے لیے ' : ' (CC BY 4.0), refreshed about every 30 minutes. This is a model forecast, not an official PMD bulletin. For official warnings see the '}
      <a href={PMD_URL} rel="noopener" className="underline">{isUr ? 'پاکستان محکمہ موسمیات (PMD)' : 'Pakistan Meteorological Department (PMD)'}</a>
      {isUr ? ' دیکھیں۔' : '.'}
    </p>
  )
}

function DayCard({ day, label, isUr, big }: { day: WeatherDay; label: string; isUr: boolean; big?: boolean }) {
  const c = conditionFor(day.code)
  const fog = fogLevel(day.morningVisibilityM)
  return (
    <div className={`rounded-2xl border border-border bg-bg p-5 ${big ? 'md:p-6' : ''}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
        {label} · {weekday(day.date, isUr)} {shortDate(day.date, isUr)}
      </p>
      <p className={`mt-1 font-display font-extrabold ${big ? 'text-5xl' : 'text-4xl'}`}>
        <span aria-hidden="true">{c.emoji}</span> {day.max}° <span className="text-2xl font-bold text-fg-muted">/ {day.min}°C</span>
      </p>
      <p className="mt-2 font-semibold">{isUr ? c.ur : c.en}</p>
      <ul className="mt-2 space-y-1 text-[0.95rem]">
        <li>{rainLabel(day.rainChance, isUr)}{day.rainMm !== null && day.rainMm > 0 ? (isUr ? ` (تقریباً ${day.rainMm} ملی میٹر)` : ` (about ${day.rainMm} mm)`) : ''}</li>
        <li>{fogLabel(fog, isUr)}{day.morningVisibilityM !== null && fog !== 'clear' ? (isUr ? ` (${day.morningVisibilityM} میٹر)` : ` (${day.morningVisibilityM} m visibility)`) : ''}</li>
        {day.windKmh !== null && <li>{isUr ? `ہوا زیادہ سے زیادہ ${day.windKmh} کلومیٹر فی گھنٹہ` : `Wind up to ${day.windKmh} km/h`}</li>}
      </ul>
    </div>
  )
}

function CityPicker({ locale, current }: { locale: Locale; current?: string }) {
  return (
    <nav aria-label="Cities" className="flex flex-wrap gap-2">
      {PK_CITIES.map((c) => (
        <Link
          key={c.slug}
          href={localePath(locale, cityPath(c.slug))}
          className={`rounded-full border border-border px-3 py-1 text-sm hover:bg-surface ${c.slug === current ? 'bg-surface font-bold' : ''}`}
        >
          {locale === 'ur' ? c.ur : c.en}
        </Link>
      ))}
    </nav>
  )
}

export function CityWeatherView({ locale, city, weather, now = new Date() }: { locale: Locale; city: PkCity; weather: CityWeather | null; now?: Date }) {
  const isUr = locale === 'ur'
  const name = isUr ? city.ur : city.en
  const today = pktToday(now)
  const tomDate = addDays(today, 1)
  const todayDay = weather ? dayFor(weather, today) : undefined
  const tomorrow = weather ? dayFor(weather, tomDate) : undefined
  const tomLabel = shortDate(tomDate, isUr)
  const seo = weatherCitySeo(city, locale, now)

  const faqs: { q: string; a: string }[] = []
  if (tomorrow) {
    const c = conditionFor(tomorrow.code)
    const fog = fogLevel(tomorrow.morningVisibilityM)
    faqs.push(
      isUr
        ? {
            q: `کل ${name} کا موسم کیسا رہے گا؟`,
            a: `${tomLabel} کو ${name} میں ${c.ur}، کم از کم ${tomorrow.min}°C اور زیادہ سے زیادہ ${tomorrow.max}°C متوقع ہے۔ ${rainLabel(tomorrow.rainChance, true)}۔`,
          }
        : {
            q: `What will the weather be tomorrow in ${name}?`,
            a: `On ${tomLabel} ${name} is forecast ${c.en.toLowerCase()}, with a low of ${tomorrow.min}°C and a high of ${tomorrow.max}°C. ${rainLabel(tomorrow.rainChance)}.`,
          },
      isUr
        ? { q: `کیا کل ${name} میں بارش ہوگی؟`, a: tomorrow.rainChance === null ? 'بارش کا امکان فی الحال دستیاب نہیں۔' : `${tomLabel} کو ${name} میں بارش کا امکان ${tomorrow.rainChance}% ہے۔` }
        : { q: `Will it rain tomorrow in ${name}?`, a: tomorrow.rainChance === null ? 'The rain chance is not available right now.' : `The chance of rain in ${name} on ${tomLabel} is ${tomorrow.rainChance}%.` },
      isUr
        ? { q: `کیا کل صبح ${name} میں دھند ہوگی؟`, a: `${fogLabel(fog, true)}۔` }
        : { q: `Will there be fog tomorrow morning in ${name}?`, a: `${fogLabel(fog)}. Fog is judged from the forecast visibility between midnight and 9 am: under 1 km counts as fog.` },
    )
  }
  faqs.push(
    isUr
      ? { q: 'یہ پیشگوئی کہاں سے آتی ہے؟', a: 'Open-Meteo کے موسمی ماڈل سے، تقریباً ہر 30 منٹ بعد اپ ڈیٹ۔ یہ پاکستان محکمہ موسمیات کا سرکاری بلیٹن نہیں۔' }
      : { q: 'Where does this forecast come from?', a: 'From the Open-Meteo weather model, refreshed about every 30 minutes. It is a model forecast, not an official Pakistan Meteorological Department bulletin.' },
  )

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'موسم' : 'Weather', url: localePath(locale, '/weather') },
            { name, url: localePath(locale, cityPath(city.slug)) },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <section className="border-b border-border bg-surface py-8 md:py-12">
        <div className="container-wide flex flex-col gap-4">
          <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
            <Link href={localePath(locale, '/')} className="hover:underline">{isUr ? 'ہوم' : 'Home'}</Link> ›{' '}
            <Link href={localePath(locale, '/weather')} className="hover:underline">{isUr ? 'موسم' : 'Weather'}</Link> › {name}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">{seo.title}</h1>
          {tomorrow ? (
            <div className="grid gap-4 md:grid-cols-2">
              <DayCard day={tomorrow} label={isUr ? 'کل' : 'Tomorrow'} isUr={isUr} big />
              {todayDay && <DayCard day={todayDay} label={isUr ? 'آج' : 'Today'} isUr={isUr} />}
            </div>
          ) : (
            <Unavailable isUr={isUr} />
          )}
          {weather?.nowTemp != null && weather.nowTime && (
            <p className="text-sm text-fg-muted">
              {isUr ? `${name} میں اس وقت ${weather.nowTemp}°C (${weather.nowTime.slice(11, 16)} PKT)` : `Right now in ${name}: ${weather.nowTemp}°C (${weather.nowTime.slice(11, 16)} PKT)`}
            </p>
          )}
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        {weather && weather.days.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">{isUr ? `${name} میں اگلے 10 دن کا موسم` : `${name} weather: 10-day forecast`}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[0.95rem]">
                <thead>
                  <tr className="border-b border-border text-fg-muted">
                    <th className="py-2 pr-4">{isUr ? 'دن' : 'Day'}</th>
                    <th className="py-2 pr-4">{isUr ? 'موسم' : 'Weather'}</th>
                    <th className="py-2 pr-4">{isUr ? 'کم / زیادہ' : 'Low / High'}</th>
                    <th className="py-2 pr-4">{isUr ? 'بارش' : 'Rain'}</th>
                    <th className="py-2 pr-4">{isUr ? 'صبح کی دھند' : 'Morning fog'}</th>
                    <th className="py-2">{isUr ? 'ہوا' : 'Wind'}</th>
                  </tr>
                </thead>
                <tbody>
                  {weather.days.map((d) => {
                    const c = conditionFor(d.code)
                    const fog = fogLevel(d.morningVisibilityM)
                    return (
                      <tr key={d.date} className={`border-b border-border ${d.date === tomDate ? 'bg-surface font-semibold' : ''}`}>
                        <td className="py-2 pr-4 whitespace-nowrap">{weekday(d.date, isUr)} {shortDate(d.date, isUr)}</td>
                        <td className="py-2 pr-4"><span aria-hidden="true">{c.emoji}</span> {isUr ? c.ur : c.en}</td>
                        <td className="py-2 pr-4 whitespace-nowrap" dir="ltr">{d.min}° / {d.max}°C</td>
                        <td className="py-2 pr-4">{d.rainChance === null ? '-' : `${d.rainChance}%`}</td>
                        <td className="py-2 pr-4">{fog === 'dense' || fog === 'fog' ? (isUr ? 'ہاں' : 'Yes') : fog === 'unknown' ? '-' : isUr ? 'نہیں' : 'No'}</td>
                        <td className="py-2 whitespace-nowrap">{d.windKmh === null ? '-' : `${d.windKmh} km/h`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Credit isUr={isUr} />
          </section>
        )}
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'دوسرے شہروں کا موسم' : 'Weather in other cities'}</h2>
          <div className="mt-3"><CityPicker locale={locale} current={city.slug} /></div>
          <p className="mt-4 text-sm">
            <Link href={localePath(locale, '/aqi-pakistan')} className="font-bold underline">
              {isUr ? 'آج کا AQI اور اسموگ' : 'Air quality (AQI) and smog today'}
            </Link>
            {' · '}
            <Link href={localePath(locale, '/namaz-timings')} className="font-bold underline">
              {isUr ? 'نماز کے اوقات' : 'Namaz timings'}
            </Link>
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}

export function WeatherHubView({ locale, weather, now = new Date() }: { locale: Locale; weather: CityWeather[]; now?: Date }) {
  const isUr = locale === 'ur'
  const tomDate = addDays(pktToday(now), 1)
  const rows = weather.map((w) => ({ w, d: dayFor(w, tomDate) })).filter((r): r is { w: CityWeather; d: WeatherDay } => Boolean(r.d))
  const seo = weatherHubSeo(locale, now)
  // One short line per main city for the searches "karachi weather", "lahore weather tomorrow"
  const line = (w: CityWeather, d: WeatherDay) => {
    const c = conditionFor(d.code)
    return isUr
      ? `${w.ur}: ${c.ur}، ${d.min}° سے ${d.max}°C${d.rainChance === null ? '' : `، بارش کا امکان ${d.rainChance}%`}۔`
      : `${w.en} weather tomorrow: ${c.en.toLowerCase()}, ${d.min}° to ${d.max}°C${d.rainChance === null ? '' : `, ${d.rainChance}% chance of rain`}.`
  }
  const city = (slug: string) => rows.find((r) => r.w.slug === slug)
  const faqs = [
    isUr
      ? { q: 'کل پاکستان میں موسم کیسا رہے گا؟', a: rows.length ? 'ہر شہر کا کل کا کم از کم اور زیادہ سے زیادہ درجہ حرارت، بارش کا امکان اور دھند اوپر کی جدول میں ہے۔ مکمل 10 دن کی پیشگوئی کے لیے شہر پر کلک کریں۔' : 'موسم کا ڈیٹا فی الحال دستیاب نہیں، کچھ دیر بعد دیکھیں۔' }
      : { q: 'What is the weather tomorrow in Pakistan?', a: rows.length ? 'The table above lists tomorrow\'s low and high, chance of rain and morning fog for each major city. Click a city for its full 10-day forecast.' : 'Weather data is temporarily unavailable. Please check again shortly.' },
    ...(!isUr && city('karachi') ? [{ q: 'What is the Karachi weather tomorrow?', a: line(city('karachi')!.w, city('karachi')!.d) }] : []),
    ...(!isUr && city('lahore') ? [{ q: 'What is the Lahore weather tomorrow?', a: line(city('lahore')!.w, city('lahore')!.d) }] : []),
    isUr
      ? { q: 'یہ پیشگوئی کہاں سے آتی ہے؟', a: 'Open-Meteo کے موسمی ماڈل سے، تقریباً ہر 30 منٹ بعد اپ ڈیٹ۔ یہ سرکاری محکمہ موسمیات کا بلیٹن نہیں؛ سرکاری وارننگز کے لیے pmd.gov.pk دیکھیں۔' }
      : { q: 'Where does this forecast come from?', a: 'From the Open-Meteo weather model, refreshed about every 30 minutes. It is a model forecast, not an official Pakistan Meteorological Department (PMD) bulletin; for official warnings see pmd.gov.pk.' },
  ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'موسم' : 'Weather', url: localePath(locale, '/weather') },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <section className="border-b border-border bg-surface py-8 md:py-12">
        <div className="container-wide flex flex-col gap-4">
          <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
            <Link href={localePath(locale, '/')} className="hover:underline">{isUr ? 'ہوم' : 'Home'}</Link> › {isUr ? 'موسم' : 'Weather'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">{isUr ? seo.title : 'Weather tomorrow in Pakistan: Karachi, Lahore, Islamabad and more'}</h1>
          {rows.length === 0 && <Unavailable isUr={isUr} />}
          {rows.length > 0 && (
            <ul className="max-w-[720px] space-y-1 text-fg-muted">
              {['karachi', 'lahore', 'islamabad', 'rawalpindi', 'peshawar', 'quetta', 'multan', 'faisalabad']
                .map((slug) => city(slug))
                .filter((r): r is { w: CityWeather; d: WeatherDay } => Boolean(r))
                .map(({ w, d }) => (
                  <li key={w.slug}>
                    <Link href={localePath(locale, cityPath(w.slug))} className="underline">{line(w, d)}</Link>
                  </li>
                ))}
            </ul>
          )}
          <p className="max-w-[720px] text-sm text-fg-muted">
            {isUr ? 'ڈیٹا کا ماخذ: Open-Meteo ماڈل۔ سرکاری وارننگز: ' : 'Data source: Open-Meteo model forecast. Official warnings: '}
            <a href={PMD_URL} rel="noopener" className="underline">{isUr ? 'PMD' : 'Pakistan Meteorological Department (PMD)'}</a>.
          </p>
        </div>
      </section>
      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        {rows.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">{isUr ? `کل ${shortDate(tomDate, true)} کو شہروں کا موسم` : `Tomorrow (${shortDate(tomDate)}) by city`}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[0.95rem]">
                <thead>
                  <tr className="border-b border-border text-fg-muted">
                    <th className="py-2 pr-4">{isUr ? 'شہر' : 'City'}</th>
                    <th className="py-2 pr-4">{isUr ? 'موسم' : 'Weather'}</th>
                    <th className="py-2 pr-4">{isUr ? 'کم / زیادہ' : 'Low / High'}</th>
                    <th className="py-2 pr-4">{isUr ? 'بارش' : 'Rain'}</th>
                    <th className="py-2">{isUr ? 'صبح کی دھند' : 'Morning fog'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ w, d }) => {
                    const c = conditionFor(d.code)
                    const fog = fogLevel(d.morningVisibilityM)
                    return (
                      <tr key={w.slug} className="border-b border-border">
                        <td className="py-2 pr-4">
                          <Link href={localePath(locale, cityPath(w.slug))} className="font-semibold underline">{isUr ? w.ur : w.en}</Link>
                        </td>
                        <td className="py-2 pr-4"><span aria-hidden="true">{c.emoji}</span> {isUr ? c.ur : c.en}</td>
                        <td className="py-2 pr-4 whitespace-nowrap" dir="ltr">{d.min}° / {d.max}°C</td>
                        <td className="py-2 pr-4">{d.rainChance === null ? '-' : `${d.rainChance}%`}</td>
                        <td className="py-2">{fog === 'dense' || fog === 'fog' ? (isUr ? 'ہاں' : 'Yes') : fog === 'unknown' ? '-' : isUr ? 'نہیں' : 'No'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Credit isUr={isUr} />
          </section>
        )}
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'کسی بھی شہر کا موسم' : 'Weather in any city'}</h2>
          <div className="mt-3"><CityPicker locale={locale} /></div>
          <p className="mt-4 text-sm">
            <Link href={localePath(locale, '/aqi-pakistan')} className="font-bold underline">
              {isUr ? 'آج کا AQI اور اسموگ' : 'Air quality (AQI) and smog today'}
            </Link>
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
