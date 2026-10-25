import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { aqiBand, getCityAqi } from '@/lib/aqi'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'آج لاہور اور پاکستان کا AQI: اسموگ اور ہوا کا معیار' : 'Lahore and Pakistan AQI Today: Smog and Air Quality',
    description:
      locale === 'ur'
        ? 'لاہور، کراچی، اسلام آباد اور دیگر شہروں کا آج کا AQI اور PM2.5، اسموگ سے بچاؤ کے مشورے۔'
        : 'Air quality index (AQI) and PM2.5 today for Lahore, Karachi, Islamabad and other Pakistani cities, with what each level means and how to protect yourself from smog.',
    enPath: '/aqi-today-pakistan',
    urPath: '/ur/aqi-today-pakistan',
    absoluteTitle: true,
  })
}

const timeLabel = (iso: string) => `${iso.slice(11, 16)} PKT, ${new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}`

export default async function AqiPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const cities = await getCityAqi()
  const lahore = cities.find((c) => c.slug === 'lahore')
  const lb = lahore ? aqiBand(lahore.aqi) : null

  const faqs = isUr
    ? [
        { q: 'آج لاہور کا AQI کتنا ہے؟', a: lahore && lb ? `${timeLabel(lahore.time)} پر لاہور کا AQI ${lahore.aqi} (${lb.ur}) اور PM2.5 ${lahore.pm25} µg/m³ ہے۔` : 'اعداد و شمار فی الحال دستیاب نہیں، کچھ دیر بعد دیکھیں۔' },
        { q: 'AQI کتنا ہو تو ماسک پہننا چاہیے؟', a: '100 سے اوپر حساس افراد، اور 150 سے اوپر سب کو باہر N95 ماسک پہننا چاہیے۔' },
      ]
    : [
        { q: 'What is the AQI in Lahore today?', a: lahore && lb ? `At ${timeLabel(lahore.time)} the AQI in Lahore is ${lahore.aqi} (${lb.en}) with PM2.5 at ${lahore.pm25} µg/m³.` : 'Air quality data is temporarily unavailable. Please check again shortly.' },
        { q: 'AQI kitna ho to mask pehanna chahiye?', a: 'Above 100 sensitive people, and above 150 everyone, should wear an N95 mask outdoors.' },
        { q: 'Where does this data come from?', a: 'These are modelled estimates from the Open-Meteo air quality service (CAMS atmospheric data), refreshed about every 30 minutes. They can differ from a street-level monitor, so use them as a guide.' },
        { q: 'What does AQI mean?', a: 'The Air Quality Index turns pollutant levels into one number on the US EPA scale: 0-50 good, 51-100 moderate, 101-150 unhealthy for sensitive groups, 151-200 unhealthy, 201-300 very unhealthy, above 300 hazardous.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'آج کا AQI' : 'AQI today', url: localePath(locale, '/aqi-today-pakistan') },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <section className="border-b border-border bg-surface py-8 md:py-12">
        <div className="container-wide flex flex-col gap-4">
          <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
            <Link href={localePath(locale, '/')} className="hover:underline">
              {isUr ? 'ہوم' : 'Home'}
            </Link>{' '}
            › {isUr ? 'آج کا AQI' : 'AQI today'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'پاکستان میں آج کا AQI اور اسموگ' : 'Pakistan AQI today: smog and air quality'}
          </h1>
          {lahore && lb ? (
            <div className="rounded-2xl border border-border bg-bg p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{isUr ? 'لاہور' : 'Lahore'}</p>
              <p className="mt-1 font-display text-5xl font-extrabold">{lahore.aqi}</p>
              <p className="mt-2">
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${lb.tone}`}>{isUr ? lb.ur : lb.en}</span>
                <span className="ms-3 text-fg-muted">PM2.5 {lahore.pm25} µg/m³</span>
              </p>
              <p className="mt-3">{isUr ? lb.adviceUr : lb.adviceEn}</p>
              <p className="mt-2 text-sm text-fg-muted">{timeLabel(lahore.time)}</p>
            </div>
          ) : (
            <p className="text-lg text-fg-muted">{isUr ? 'اعداد و شمار فی الحال دستیاب نہیں۔ کچھ دیر بعد دیکھیں۔' : 'Air quality data is temporarily unavailable. Please check again shortly.'}</p>
          )}
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        {cities.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">{isUr ? 'شہروں کا AQI' : 'AQI by city'}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-[0.95rem]">
                <thead>
                  <tr className="border-b border-border text-fg-muted">
                    <th className="py-2 pr-4">{isUr ? 'شہر' : 'City'}</th>
                    <th className="py-2 pr-4">AQI</th>
                    <th className="py-2 pr-4">{isUr ? 'درجہ' : 'Level'}</th>
                    <th className="py-2">PM2.5</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cities].sort((a, b) => b.aqi - a.aqi).map((c) => {
                    const b = aqiBand(c.aqi)
                    return (
                      <tr key={c.slug} className="border-b border-border">
                        <td className="py-2 pr-4">{isUr ? c.ur : c.en}</td>
                        <td className="py-2 pr-4 font-bold">{c.aqi}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${b.tone}`}>{isUr ? b.ur : b.en}</span>
                        </td>
                        <td className="py-2">{c.pm25} µg/m³</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-fg-muted">
              {isUr ? 'ماخذ: ' : 'Source: modelled estimates from '}
              <a href="https://open-meteo.com/en/docs/air-quality-api" rel="noopener" className="underline">
                Open-Meteo
              </a>
              {isUr ? ' (CAMS ڈیٹا)، تقریباً ہر 30 منٹ بعد اپ ڈیٹ۔ یہ زمینی مانیٹر سے مختلف ہو سکتے ہیں۔' : ' (CAMS data), refreshed about every 30 minutes. They can differ from a street-level monitor.'}
            </p>
          </section>
        )}
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
