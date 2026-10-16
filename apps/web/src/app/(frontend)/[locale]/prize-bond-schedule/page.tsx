import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { formatRs, PRIZE_BOND_DRAWS_2026, upcomingDraws } from '@/lib/prize-bonds'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'پرائز بانڈ ڈرا شیڈول 2026: اگلا ڈرا کب ہے' : 'Prize Bond Draw Schedule 2026 Pakistan: Next Draw Date',
    description:
      locale === 'ur'
        ? 'پاکستان میں پرائز بانڈ کے اگلے ڈرا کی تاریخ، مالیت اور شہر۔ 2026 کا مکمل شیڈول اور ٹیکس کی معلومات۔'
        : 'Next prize bond draw in Pakistan: date, denomination and city, plus the rest of the 2026 schedule and the tax on winnings.',
    enPath: '/prize-bond-schedule',
    urPath: '/ur/prize-bond-schedule',
    absoluteTitle: true,
  })
}

const dateLabel = (iso: string, isUr: boolean) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function PrizeBondSchedulePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const upcoming = upcomingDraws()
  const next = upcoming[0]
  const nextDay = next ? upcoming.filter((d) => d.date === next.date) : []

  const faqs = isUr
    ? [
        { q: 'پرائز بانڈ کا اگلا ڈرا کب ہے؟', a: next ? `اگلا ڈرا ${dateLabel(next.date, true)} کو ہے۔` : 'اس سال کے تمام ڈرا ہو چکے ہیں۔ نیا شیڈول قومی بچت کی ویب سائٹ پر دیکھیں۔' },
        { q: 'انعام پر ٹیکس کتنا ہے؟', a: 'فائلر کے لیے 15 فیصد اور نان فائلر کے لیے 30 فیصد۔' },
      ]
    : [
        { q: 'When is the next prize bond draw?', a: next ? `The next draw is on ${dateLabel(next.date, false)}: ${nextDay.map((d) => `${formatRs(d.denomination)} in ${d.city}`).join(' and ')}.` : 'All 2026 draws have been held. Check savings.gov.pk for the next schedule.' },
        { q: '750 prize bond list kab hai?', a: 'The Rs750 draw is held a few times a year. The 15 October 2026 draw in Rawalpindi (draw 108) has already been held; check the schedule above for any later date.' },
        { q: 'How is tax charged on prize bond winnings?', a: 'Prize money is taxed at 15% for tax filers and 30% for non-filers.' },
        { q: 'Where do I get the official draw list?', a: 'The official lists are published by National Savings at savings.gov.pk. This page shows dates only and does not publish results.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'پرائز بانڈ شیڈول' : 'Prize bond schedule', url: localePath(locale, '/prize-bond-schedule') },
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
            › {isUr ? 'پرائز بانڈ شیڈول' : 'Prize bond schedule'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'پرائز بانڈ ڈرا شیڈول 2026' : 'Prize bond draw schedule 2026'}
          </h1>
          {next ? (
            <div className="rounded-2xl border border-border bg-bg p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{isUr ? 'اگلا ڈرا' : 'Next draw'}</p>
              <p className="mt-1 font-display text-2xl font-bold">{dateLabel(next.date, isUr)}</p>
              <ul className="mt-2 space-y-1 text-lg">
                {nextDay.map((d) => (
                  <li key={`${d.date}-${d.denomination}`}>
                    {formatRs(d.denomination)} · {d.city}
                    {d.drawNo ? ` · ${isUr ? 'ڈرا' : 'draw'} ${d.drawNo}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-lg">{isUr ? 'اس سال کے تمام ڈرا ہو چکے ہیں۔' : 'All 2026 draws have been held.'}</p>
          )}
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'باقی ڈرا' : 'Remaining 2026 draws'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th className="py-2 pr-4">{isUr ? 'تاریخ' : 'Date'}</th>
                  <th className="py-2 pr-4">{isUr ? 'مالیت' : 'Denomination'}</th>
                  <th className="py-2">{isUr ? 'شہر' : 'City'}</th>
                </tr>
              </thead>
              <tbody>
                {PRIZE_BOND_DRAWS_2026.map((d) => {
                  const held = !upcoming.includes(d)
                  return (
                    <tr key={`${d.date}-${d.denomination}`} className={held ? 'border-b border-border text-fg-muted' : 'border-b border-border'}>
                      <td className="py-2 pr-4">{dateLabel(d.date, isUr)}</td>
                      <td className="py-2 pr-4">{formatRs(d.denomination)}</td>
                      <td className="py-2">
                        {d.city}
                        {held ? (isUr ? ' (ہو چکا)' : ' (held)') : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            {isUr
              ? 'انعامی رقم پر ٹیکس: فائلر 15 فیصد، نان فائلر 30 فیصد۔ سرکاری فہرست قومی بچت کی ویب سائٹ پر دیکھیں۔ ہم نتائج شائع نہیں کرتے۔'
              : 'Prize money is taxed at 15% for filers and 30% for non-filers. We list dates only, not results: see the official list on '}
            {!isUr ? (
              <a href="https://savings.gov.pk/prize-bonds/" rel="noopener" className="underline">
                savings.gov.pk
              </a>
            ) : (
              <>
                {' '}
                <a href="https://savings.gov.pk/prize-bonds/" rel="noopener" className="underline">
                  savings.gov.pk
                </a>
              </>
            )}
            {!isUr ? '.' : ''}
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
