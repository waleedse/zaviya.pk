import Link from 'next/link'
import { LoanEmiCalculator } from '@/components/data/LoanEmiCalculator'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { POLICY } from '@/lib/policy-rate'
import { KIBOR_REFERENCE } from '@/lib/loan-emi'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'لون EMI کیلکولیٹر پاکستان | کار، گھر، پرسنل لون کی قسط' : 'Loan EMI Calculator Pakistan: Car, Home and Personal Loan Instalment',
    description:
      locale === 'ur'
        ? 'کار، گھر یا پرسنل لون کی ماہانہ قسط اسٹیٹ بینک کے پالیسی ریٹ کے مطابق نکالیں، قسطوں کے جدول کے ساتھ۔ آپ کے اعداد براؤزر سے باہر نہیں جاتے۔'
        : 'Work out the monthly instalment (EMI) of a car, home or personal loan in Pakistan from the current SBP policy rate plus your bank’s spread, with a month-by-month table. Your numbers never leave your browser.',
    enPath: '/loan-emi-calculator-pakistan',
    urPath: '/ur/loan-emi-calculator-pakistan',
    absoluteTitle: true,
  })
}

export default async function LoanEmiPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'

  const faqs = isUr
    ? [
        { q: 'قرض کی ماہانہ قسط (EMI) کیسے نکلتی ہے؟', a: 'قسط = P × r × (1+r)^n ÷ ((1+r)^n − 1)، جہاں P قرض کی رقم، r ماہانہ شرح (سالانہ شرح ÷ 12) اور n مہینوں کی تعداد ہے۔ کیلکولیٹر یہی فارمولا استعمال کرتا ہے۔' },
        { q: 'کار یا گھر کے قرض کی شرح کیا ہوتی ہے؟', a: `بینک عموماً KIBOR یا پالیسی ریٹ (اس وقت ${POLICY.rate}%) کے اوپر اپنا اسپریڈ لگاتے ہیں۔ یہاں اسپریڈ آپ خود بدل سکتے ہیں؛ اپنے بینک کی اصل شرح اسی سے پوچھیں۔` },
        { q: 'کیا یہ بینک کی حتمی قسط ہے؟', a: 'نہیں۔ پروسیسنگ فیس، انشورنس، پیشگی ادائیگی اور متغیر شرح کی ری پرائسنگ شامل نہیں۔ حتمی قسط بینک بتائے گا۔' },
        { q: 'کیا میرے اعداد زاویہ کو جاتے ہیں؟', a: 'نہیں۔ حساب آپ کے براؤزر میں ہوتا ہے، کوئی رقم یا شرح ہمارے سرور کو نہیں بھیجی جاتی۔' },
      ]
    : [
        { q: 'How is a loan EMI calculated?', a: 'EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1), where P is the loan amount, r the monthly rate (annual rate ÷ 12) and n the number of months. The calculator uses exactly this reducing-balance formula.' },
        { q: 'What interest rate do car and home loans use in Pakistan?', a: `Banks usually price loans as KIBOR or the SBP policy rate (currently ${POLICY.rate}%) plus their own spread. Here you set the spread yourself; ask your bank for its actual rate.` },
        { q: 'EMI kitni banegi, aur kya yeh bank ki final qist hai?', a: 'Yeh ek andaza hai. Processing fee, insurance, early-payment charges aur floating-rate repricing shamil nahin. Final qist bank batayega.' },
        { q: 'Does Zaviya store the numbers I enter?', a: 'No. The calculation runs in your browser; no amount or rate is sent to Zaviya or anyone else.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'لون EMI کیلکولیٹر' : 'Loan EMI calculator', url: localePath(locale, '/loan-emi-calculator-pakistan') },
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
            › {isUr ? 'لون EMI کیلکولیٹر' : 'Loan EMI calculator'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'لون EMI کیلکولیٹر: کار، گھر، پرسنل' : 'Loan EMI calculator for Pakistan: car, home, personal'}
          </h1>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? `ڈیفالٹ شرح اسٹیٹ بینک کا پالیسی ریٹ (${POLICY.rate}%) جمع آپ کا بدلنے والا اسپریڈ ہے۔ یہ اندازہ ہے، بینک کی پیشکش نہیں۔`
              : `The default rate is the SBP policy rate (${POLICY.rate}%) plus a spread you can edit. This is an estimate, not a bank offer.`}
          </p>
        </div>
      </section>
      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <LoanEmiCalculator isUr={isUr} policyRate={POLICY.rate} kibor={KIBOR_REFERENCE} />
        <p className="text-sm text-fg-muted">
          {isUr ? 'پالیسی ریٹ کی معلومات' : 'Policy rate as of'} {POLICY.asOf}.{' '}
          <Link href={localePath(locale, '/sbp-policy-rate')} className="underline">
            {isUr ? 'پالیسی ریٹ اور KIBOR' : 'SBP policy rate and KIBOR'}
          </Link>
        </p>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
