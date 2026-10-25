import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { GulfConverter } from '@/components/data/GulfConverter'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { pickGulfRates } from '@/lib/gulf-rates'
import { getDataPage } from '@/lib/queries'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'

export const revalidate = 900

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'آج سعودی ریال اور یو اے ای درہم کا ریٹ پاکستان میں' : 'Saudi Riyal and UAE Dirham Rate in Pakistan Today (Open Market)',
    description:
      locale === 'ur'
        ? 'اوپن مارکیٹ میں سعودی ریال اور درہم کا آج کا خرید اور فروخت ریٹ، اور ہوم ریمیٹنس سے فرق۔'
        : 'Today’s open-market buy and sell rate for the Saudi riyal (SAR) and UAE dirham (AED) in Pakistani rupees, a quick converter, and how it differs from remittance rates.',
    enPath: '/riyal-dirham-rate-pakistan',
    urPath: '/ur/riyal-dirham-rate-pakistan',
    absoluteTitle: true,
  })
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' }) + ' PKT'

export default async function GulfRatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const page = await getDataPage(locale, 'usd-pkr')
  const rates = pickGulfRates(page.table)
  const sar = rates.find((r) => r.code === 'SAR')
  const aed = rates.find((r) => r.code === 'AED')

  const faqs = isUr
    ? [
        { q: 'آج ریال کا ریٹ کیا ہے؟', a: sar ? `اوپن مارکیٹ میں سعودی ریال خرید ${sar.buy} اور فروخت ${sar.sell} روپے ہے۔` : 'ریٹ فی الحال دستیاب نہیں۔' },
        { q: 'آج درہم کتنے کا ہے؟', a: aed ? `اوپن مارکیٹ میں درہم خرید ${aed.buy} اور فروخت ${aed.sell} روپے ہے۔` : 'ریٹ فی الحال دستیاب نہیں۔' },
      ]
    : [
        { q: 'What is the Saudi riyal rate in Pakistan today?', a: sar ? `In the open market the Saudi riyal buys at Rs${sar.buy} and sells at Rs${sar.sell}.` : 'The rate is temporarily unavailable.' },
        { q: 'Riyal rate kitna hai?', a: sar ? `Open market mein riyal ka buy rate Rs${sar.buy} aur sell rate Rs${sar.sell} hai.` : 'Rate abhi dastiyab nahi.' },
        { q: 'What is the UAE dirham rate in Pakistan today?', a: aed ? `In the open market the UAE dirham buys at Rs${aed.buy} and sells at Rs${aed.sell}.` : 'The rate is temporarily unavailable.' },
        { q: 'Dirham kitne ka hai?', a: aed ? `Open market mein dirham ka buy rate Rs${aed.buy} aur sell rate Rs${aed.sell} hai.` : 'Rate abhi dastiyab nahi.' },
        { q: 'Why is my remittance rate different?', a: 'Remittance apps and banks use their own exchange rate and charge a fee. The rates here are cash prices from open-market exchange companies, so the two will not match.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'ریال اور درہم ریٹ' : 'Riyal and dirham rate', url: localePath(locale, '/riyal-dirham-rate-pakistan') },
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
            › {isUr ? 'ریال اور درہم ریٹ' : 'Riyal and dirham rate'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'آج سعودی ریال اور درہم کا ریٹ' : 'Saudi riyal and UAE dirham rate today'}
          </h1>
          {rates.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {rates.map((r) => (
                <div key={r.code} className="rounded-2xl border border-border bg-bg p-5">
                  <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                    {r.code === 'SAR' ? (isUr ? 'سعودی ریال (SAR)' : 'Saudi riyal (SAR)') : isUr ? 'یو اے ای درہم (AED)' : 'UAE dirham (AED)'}
                  </p>
                  <p className="mt-2 text-lg">
                    {isUr ? 'خرید' : 'Buy'} <span className="font-display text-3xl font-extrabold">Rs{r.buy}</span>
                  </p>
                  <p className="text-lg">
                    {isUr ? 'فروخت' : 'Sell'} <span className="font-display text-3xl font-extrabold">Rs{r.sell}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-lg text-fg-muted">{isUr ? 'ریٹ فی الحال دستیاب نہیں۔' : 'Rates are temporarily unavailable.'}</p>
          )}
          {rates.length > 0 && (
            <p className="text-sm text-fg-muted">
              {isUr ? 'اپ ڈیٹ' : 'Updated'}: {stamp(page.updatedAt)} · {isUr ? 'ماخذ' : 'Source'}: forex.pk {isUr ? 'اوپن مارکیٹ' : 'open market'}
            </p>
          )}
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        {rates.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">{isUr ? 'ریال یا درہم کو روپے میں بدلیں' : 'Convert riyal or dirham to rupees'}</h2>
            <GulfConverter rates={rates} isUr={isUr} />
          </section>
        )}
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-bold">{isUr ? 'کیش ریٹ بمقابلہ ریمیٹنس' : 'Cash rate vs remittance'}</h2>
          <p className="mt-2 text-fg-muted">
            {isUr
              ? 'یہ اوپن مارکیٹ کے نقد ریٹ ہیں۔ ریمیٹنس ایپس اور بینک اپنا ریٹ اور فیس لگاتے ہیں، اس لیے رقم مختلف ہو سکتی ہے۔ بھیجنے سے پہلے اپنی ایپ کا ریٹ دیکھ لیں۔'
              : 'These are cash prices from open-market exchange companies. Remittance apps and banks apply their own rate and a fee, so what your family receives can differ. Check your app’s rate before you send.'}
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            <Link href={localePath(locale, '/dollar-rate-today-pakistan')} className="underline">
              {isUr ? 'ڈالر کا آج کا ریٹ' : 'Dollar rate today in Pakistan'}
            </Link>
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
