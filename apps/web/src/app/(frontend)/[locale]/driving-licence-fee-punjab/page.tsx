import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { COURIER, DLIMS, DUPLICATE, LEARNER_FEE, REGULAR, RENEWAL, regular, rs } from '@/lib/dl-fees-punjab'

export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'پنجاب ڈرائیونگ لائسنس فیس 2026: لرنر، موٹر سائیکل، کار' : 'Driving Licence Fee in Punjab 2026: Learner, Bike, Car, Renewal',
    description:
      locale === 'ur'
        ? 'پنجاب حکومت (DLIMS) کی سرکاری فیس: لرنر لائسنس، موٹر سائیکل، کار، ایل ٹی وی، تجدید، جرمانے اور ڈپلیکیٹ لائسنس۔'
        : "Official Punjab (DLIMS) driving licence fees: learner, motorcycle, car, LTV, renewal with late fines, and duplicate licence, with courier charges.",
    enPath: '/driving-licence-fee-punjab',
    urPath: '/ur/driving-licence-fee-punjab',
    absoluteTitle: true,
  })
}

export default async function DlFeePunjabPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const readOn = new Date(`${DLIMS.readOn}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const bike = regular('mcycle')
  const car = regular('car')
  const both = regular('mcycle-car')

  const faqs = isUr
    ? [
        { q: 'پنجاب میں لرنر لائسنس کی فیس کتنی ہے؟', a: `DLIMS کے مطابق ہر کیٹیگری (موٹر سائیکل، کار وغیرہ) کے لیے ${rs(LEARNER_FEE)}۔` },
        { q: 'Driving licence fee kitni hai?', a: `Motorcycle: test ${rs(bike.test)} + fee ${rs(bike.fee)} + courier ${rs(COURIER)}. Car: test ${rs(car.test)} + fee ${rs(car.fee)} + courier ${rs(COURIER)}. Learner ${rs(LEARNER_FEE)}.` },
        { q: 'موٹر سائیکل اور کار دونوں کا لائسنس کتنے کا ہے؟', a: `ٹیسٹ فیس ${rs(both.test)}، پاس ہونے کے بعد ${rs(both.fee)}، اور کورئیر ${rs(COURIER)}۔ DLIMS کے مطابق ملی جلی کیٹیگری میں سب سے زیادہ فیس والی کیٹیگری کی فیس لگتی ہے۔` },
        { q: 'لائسنس کتنے سال کا بنتا ہے؟', a: 'DLIMS کے مطابق ریگولر لائسنس 1 سے 5 سال تک کا بن سکتا ہے، اور دی گئی فیس ایک سال کی ہے۔' },
        { q: 'لائسنس کی تجدید دیر سے کرانے پر جرمانہ کتنا ہے؟', a: `کار کے لیے: 3 ماہ تک ${rs(675)}، 3 ماہ سے 1 سال تک ${rs(1350)}، ایک سال کے بعد ${rs(3375)}۔ باقی کیٹیگریز نیچے جدول میں ہیں۔` },
      ]
    : [
        { q: 'What is the learner licence fee in Punjab?', a: `DLIMS says ${rs(LEARNER_FEE)} for each category (bike, car and so on).` },
        { q: 'Driving licence fee kitni hai?', a: `Motorcycle: test ${rs(bike.test)} + fee ${rs(bike.fee)} + courier ${rs(COURIER)}. Car: test ${rs(car.test)} + fee ${rs(car.fee)} + courier ${rs(COURIER)}. Learner ${rs(LEARNER_FEE)}.` },
        { q: 'How much is a motorcycle plus car licence?', a: `Test fee ${rs(both.test)}, ${rs(both.fee)} after passing, plus ${rs(COURIER)} courier. DLIMS charges the highest category's fee for any combination.` },
        { q: 'For how many years is a licence made?', a: 'DLIMS says a regular licence can be made for 1 to 5 years, and the fees shown are for one year.' },
        { q: 'What is the fine for late renewal?', a: `For a car: ${rs(675)} up to 3 months late, ${rs(1350)} from 3 months to a year, ${rs(3375)} after a year. Other categories are in the table below.` },
      ]

  const th = 'py-2 pe-3 text-start'
  const td = 'py-2 pe-3'
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'ڈرائیونگ لائسنس فیس پنجاب' : 'Driving licence fee Punjab', url: localePath(locale, '/driving-licence-fee-punjab') },
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
            › {isUr ? 'ڈرائیونگ لائسنس فیس پنجاب' : 'Driving licence fee Punjab'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'پنجاب ڈرائیونگ لائسنس فیس 2026' : 'Driving licence fee in Punjab 2026'}
          </h1>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? `یہ فیس پنجاب حکومت کے DLIMS فیس صفحے سے ${readOn} کو لی گئی ہے۔ فیس ایک سال کی ہے۔`
              : `Fees from the Punjab government's DLIMS fee page, read on ${readOn}. DLIMS says the fees are for one year; a licence can be made for 1 to 5 years.`}
          </p>
          <p className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm">
            {`${isUr ? 'خلاصہ (رومن اردو)' : 'In short (Roman Urdu)'}: Learner ${rs(LEARNER_FEE)}. Bike ${rs(bike.fee)} + test ${rs(bike.test)}. Car ${rs(car.fee)} + test ${rs(car.test)}. Courier ${rs(COURIER)} alag.`}
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'نیا ریگولر لائسنس' : 'New regular licence'}</h2>
          <p className="mt-1 text-sm text-fg-muted">{isUr ? `لرنر لائسنس: ہر کیٹیگری ${rs(LEARNER_FEE)}` : `Learner licence first: ${rs(LEARNER_FEE)} for each category.`}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className={th}>{isUr ? 'کیٹیگری' : 'Category'}</th>
                  <th className={th}>{isUr ? 'ٹیسٹ فیس' : 'Test fee'}</th>
                  <th className={th}>{isUr ? 'پاس ہونے کے بعد' : 'Fee after passing'}</th>
                  <th className={th}>{isUr ? 'کورئیر سمیت' : 'With courier'}</th>
                </tr>
              </thead>
              <tbody>
                {REGULAR.map((x) => (
                  <tr key={x.key} className="border-b border-border">
                    <td className={td}>{isUr ? x.ur : x.en}</td>
                    <td className={td}>{rs(x.test)}</td>
                    <td className={`${td} font-semibold`}>{rs(x.fee)}</td>
                    <td className={`${td} font-semibold`}>{rs(x.fee + COURIER)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr ? 'ملی جلی کیٹیگری میں سب سے زیادہ فیس والی کیٹیگری کی فیس لگتی ہے۔' : "For any combination, the highest category's fee applies (DLIMS). The courier total excludes the test fee, as DLIMS shows it."}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'تجدید اور دیر کا جرمانہ' : 'Renewal and late fines'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className={th}>{isUr ? 'کیٹیگری' : 'Category'}</th>
                  <th className={th}>{isUr ? 'تجدید (1 سال)' : 'Renewal (1 year)'}</th>
                  <th className={th}>{isUr ? '3 ماہ تک دیر' : 'Up to 3 months late'}</th>
                  <th className={th}>{isUr ? '3 ماہ سے 1 سال' : '3 months to 1 year'}</th>
                  <th className={th}>{isUr ? '1 سال کے بعد' : 'Over 1 year'}</th>
                </tr>
              </thead>
              <tbody>
                {RENEWAL.map((x) => (
                  <tr key={x.en} className="border-b border-border">
                    <td className={td}>{isUr ? x.ur : x.en}</td>
                    <td className={`${td} font-semibold`}>{rs(x.fee)}</td>
                    <td className={td}>+{rs(x.fine3m)}</td>
                    <td className={td}>+{rs(x.fine1y)}</td>
                    <td className={td}>+{rs(x.fineOver1y)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr ? `کورئیر ${rs(COURIER)} الگ۔ اصل لائسنس نہ ہو تو ڈپلیکیٹ فیس بھی لگتی ہے۔` : `Courier ${rs(COURIER)} extra. If the original licence is missing, the duplicate fee is added.`}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ڈپلیکیٹ لائسنس' : 'Duplicate (lost) licence'}</h2>
          <ul className="mt-3 space-y-1">
            {DUPLICATE.map((d) => (
              <li key={d.en}>
                {isUr ? d.ur : d.en}: <span className="font-semibold">{rs(d.fee)}</span> {isUr ? `+ کورئیر ${rs(COURIER)}` : `+ ${rs(COURIER)} courier`}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ذریعہ' : 'Source'}</h2>
          <p className="mt-3">
            <a href={DLIMS.feeUrl} rel="noopener" className="underline">
              {isUr ? 'DLIMS پنجاب: فیس اسٹرکچر (سرکاری)' : 'DLIMS Punjab: Fee Structure (official)'}
            </a>
            {isUr ? `۔ فون ${DLIMS.helpline}۔` : `. Phone ${DLIMS.helpline}. Applications and payment are on the Punjab government's Dastak app.`}
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr ? 'زاویہ درخواست یا فیس نہیں لیتا۔ ' : 'Zaviya takes no applications or payments. See also: '}
            <Link href={localePath(locale, '/cnic-fee-pakistan')} className="underline">
              {isUr ? 'نادرا شناختی کارڈ فیس' : 'NADRA ID card fee'}
            </Link>
            {' · '}
            <Link href={localePath(locale, '/passport-fee-pakistan')} className="underline">
              {isUr ? 'ای پاسپورٹ فیس' : 'e-passport fee'}
            </Link>
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
