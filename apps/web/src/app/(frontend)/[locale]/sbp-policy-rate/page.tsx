import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { KIBOR, MPC_DATES_FY27, nextMpc, POLICY } from '@/lib/policy-rate'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'ایس بی پی پالیسی ریٹ آج اور KIBOR | اگلی MPC کب ہے' : 'SBP Policy Rate Today and KIBOR: Next MPC Date',
    description:
      locale === 'ur'
        ? 'اسٹیٹ بینک آف پاکستان کا موجودہ پالیسی ریٹ، شرحِ سود کوریڈور، KIBOR اور اگلی مانیٹری پالیسی میٹنگ کی تاریخ۔'
        : 'Current State Bank of Pakistan policy rate, interest rate corridor, KIBOR and the date of the next Monetary Policy Committee meeting, with what it means for loans.',
    enPath: '/sbp-policy-rate',
    urPath: '/ur/sbp-policy-rate',
    absoluteTitle: true,
  })
}

const dateLabel = (iso: string, isUr: boolean) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function SbpPolicyRatePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const next = nextMpc()
  const todayPk = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
  const decisionDay = next === todayPk
  const pct = (n: number) => `${n.toFixed(2)}%`

  const faqs = isUr
    ? [
        { q: 'پالیسی ریٹ کتنی ہے؟', a: `اسٹیٹ بینک کا پالیسی ریٹ ${pct(POLICY.rate)} ہے (${dateLabel(POLICY.asOf, true)} تک کی معلومات)۔` },
        { q: 'KIBOR کیا ہے؟', a: 'KIBOR کراچی انٹربینک آفرڈ ریٹ ہے، یعنی بینک ایک دوسرے کو جس شرح پر قرض دیتے ہیں۔ کار اور گھر کے قرضے عموماً KIBOR کے ساتھ بینک کا مارجن جوڑ کر طے ہوتے ہیں۔' },
        { q: 'اگلی مانیٹری پالیسی میٹنگ کب ہے؟', a: next ? `اگلی میٹنگ ${dateLabel(next, true)} کو ہے۔` : 'اس مالی سال کی تمام میٹنگز ہو چکی ہیں۔' },
      ]
    : [
        { q: 'What is the SBP policy rate today?', a: `The State Bank of Pakistan policy rate is ${pct(POLICY.rate)} (as of ${dateLabel(POLICY.asOf, false)}). This page is updated after each Monetary Policy Committee statement.` },
        { q: 'Policy rate kitni hai?', a: `Policy rate ${pct(POLICY.rate)} hai, aur corridor ${pct(POLICY.corridorFloor)} se ${pct(POLICY.corridorCeiling)} tak.` },
        { q: 'What is KIBOR?', a: 'KIBOR is the Karachi Interbank Offered Rate, the rate at which banks lend to each other. Many car, home and business loans are priced as KIBOR plus the bank’s margin, so they move when KIBOR moves.' },
        { q: 'KIBOR kya hai?', a: 'KIBOR woh rate hai jis par banks aapas mein qarz dete hain. Aapke loan ka rate aam tor par KIBOR aur bank ke margin ko jod kar banta hai.' },
        { q: 'When is the next SBP Monetary Policy Committee meeting?', a: next ? `The next MPC meeting is on ${dateLabel(next, false)}; the statement is released the same day.` : 'All FY27 meetings have been held.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'پالیسی ریٹ' : 'SBP policy rate', url: localePath(locale, '/sbp-policy-rate') },
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
            › {isUr ? 'پالیسی ریٹ' : 'SBP policy rate'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'ایس بی پی پالیسی ریٹ آج' : 'SBP policy rate today'}
          </h1>
          <div className="rounded-2xl border border-border bg-bg p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{isUr ? 'موجودہ پالیسی ریٹ' : 'Current policy rate'}</p>
            <p className="mt-1 font-display text-5xl font-extrabold">{pct(POLICY.rate)}</p>
            <p className="mt-2 text-fg-muted">
              {isUr ? 'کوریڈور' : 'Interest rate corridor'}: {pct(POLICY.corridorFloor)} – {pct(POLICY.corridorCeiling)} · {isUr ? 'معلومات کی تاریخ' : 'as of'} {dateLabel(POLICY.asOf, isUr)}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {isUr ? 'ماخذ' : 'Source'}:{' '}
              <a href="https://www.sbp.org.pk/" rel="noopener" className="underline">
                sbp.org.pk
              </a>
            </p>
          </div>
          {next && (
            <div className="rounded-2xl border border-border bg-bg p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{isUr ? 'اگلی MPC میٹنگ' : 'Next MPC meeting'}</p>
              <p className="mt-1 font-display text-2xl font-bold">{dateLabel(next, isUr)}</p>
              {decisionDay && (
                <p className="mt-2 text-fg-muted">
                  {isUr
                    ? 'آج فیصلہ متوقع ہے۔ جب تک اسٹیٹ بینک کا بیان جاری نہ ہو، اوپر کی شرح پرانی ہی ہے۔'
                    : 'The decision is due today. Until the SBP statement is out, the rate above is the previous one; this page is updated once it is published.'}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'KIBOR آج' : 'KIBOR today'}</h2>
          {KIBOR ? (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-[0.95rem]">
                  <thead>
                    <tr className="border-b border-border text-fg-muted">
                      <th className="py-2 pr-4">{isUr ? 'مدت' : 'Tenor'}</th>
                      <th className="py-2 pr-4">{isUr ? 'بِڈ' : 'Bid'}</th>
                      <th className="py-2">{isUr ? 'آفر' : 'Offer'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KIBOR.rows.map((r) => (
                      <tr key={r.tenor} className="border-b border-border">
                        <td className="py-2 pr-4">{r.tenor}</td>
                        <td className="py-2 pr-4">{pct(r.bid)}</td>
                        <td className="py-2">{pct(r.offer)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-fg-muted">
                {isUr ? 'اسٹیٹ بینک کی تاریخ' : 'SBP as-of date'}: {dateLabel(KIBOR.asOf, isUr)}.{' '}
                {isUr ? 'ویک اینڈ اور چھٹی پر نیا فکس نہیں آتا، آخری کاروباری دن کا ریٹ لاگو رہتا ہے۔' : 'No new fix is published on weekends and holidays; the last business day applies.'}
              </p>
            </>
          ) : (
            <p className="mt-3 text-fg-muted">
              {isUr ? 'روزانہ کا KIBOR فکس اسٹیٹ بینک کی ویب سائٹ پر دیکھیں: ' : 'The daily KIBOR fix (3M, 6M, 12M bid and offer) is published by the State Bank at '}
              <a href="https://www.sbp.org.pk/ecodata/kibor_index.asp" rel="noopener" className="underline">
                sbp.org.pk
              </a>
              .
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'آپ کے قرض پر اثر' : 'What it means for your loan'}</h2>
          <p className="mt-2 text-fg-muted">
            {isUr
              ? 'بہت سے کار، گھر اور کاروباری قرضے KIBOR جمع بینک کا مارجن کی بنیاد پر چلتے ہیں۔ پالیسی ریٹ بڑھنے سے KIBOR عموماً بڑھتا ہے اور متغیر شرح والے قرض کی قسط بڑھ سکتی ہے۔ مقررہ شرح والے قرض پر فوری فرق نہیں پڑتا۔ اپنی قسط کا درست حساب بینک سے لیں۔'
              : 'Many car, home and business loans are priced as KIBOR plus the bank’s margin. When the policy rate rises, KIBOR usually follows, and a floating-rate loan can cost more at its next repricing; a fixed-rate loan does not change straight away. Ask your bank for the exact instalment.'}
          </p>
          <p className="mt-2">
            <Link href={localePath(locale, '/loan-emi-calculator-pakistan')} className="underline">
              {isUr ? 'لون EMI کیلکولیٹر' : 'Loan EMI calculator (car, home, personal)'}
            </Link>
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'مالی سال 2027 کی MPC تاریخیں' : 'FY27 MPC meeting dates'}</h2>
          <ul className="mt-3 space-y-1">
            {MPC_DATES_FY27.map((d) => (
              <li key={d} className={d < todayPk ? 'text-fg-muted' : ''}>
                {dateLabel(d, isUr)}
                {d < todayPk ? (isUr ? ' (ہو چکی)' : ' (held)') : ''}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-fg-muted">
            {isUr ? 'سرکاری کیلنڈر' : 'Official calendar'}:{' '}
            <a href="https://www.sbp.org.pk/our-operations/monetary-policy/monetary-policy" rel="noopener" className="underline">
              sbp.org.pk
            </a>
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
