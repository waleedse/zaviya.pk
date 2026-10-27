import Link from 'next/link'
import { PassportFeePicker } from '@/components/data/PassportFeePicker'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { FEES, PASSPORT, SOURCES, rs } from '@/lib/passport-fees'

export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'پاکستان ای پاسپورٹ فیس 2026: 5 اور 10 سال، عام اور ارجنٹ' : 'Pakistan E-Passport Fee 2026: 5 and 10 Year, Normal and Urgent',
    description:
      locale === 'ur'
        ? 'ای پاسپورٹ کی فیس: 36 اور 72 صفحات، 5 اور 10 سال، عام اور ارجنٹ۔ آن لائن ادائیگی اور درخواست کا طریقہ۔'
        : 'E-passport fees in Pakistan for 36 and 72 pages, 5 and 10 years, normal and urgent, with how to pay online now that cash is no longer taken at passport offices.',
    enPath: '/passport-fee-pakistan',
    urPath: '/ur/passport-fee-pakistan',
    absoluteTitle: true,
  })
}

export default async function PassportFeePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const asOf = new Date(`${PASSPORT.asOf}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const f = (years: number, pages: number) => FEES.find((x) => x.years === years && x.pages === pages)!

  const faqs = isUr
    ? [
        { q: 'ای پاسپورٹ کی فیس کتنی ہے؟', a: `رپورٹ شدہ فیس: 5 سال 36 صفحات ${rs(f(5, 36).normal)} (عام) اور ${rs(f(5, 36).urgent)} (ارجنٹ)؛ 10 سال 36 صفحات ${rs(f(10, 36).normal)} اور ${rs(f(10, 36).urgent)}۔ تازہ ترین رقم DGIP سے تصدیق کریں۔` },
        { q: 'Passport fee kitni hai?', a: `5 saal 36 pages ki normal fee ${rs(f(5, 36).normal)} aur urgent ${rs(f(5, 36).urgent)} report hui hai. Poora chart upar hai; DGIP se confirm kar lein.` },
        { q: '72 صفحات کے پاسپورٹ کی فیس کتنی ہے؟', a: `5 سال: ${rs(f(5, 72).normal)} عام، ${rs(f(5, 72).urgent)} ارجنٹ۔ 10 سال: ${rs(f(10, 72).normal)} عام، ${rs(f(10, 72).urgent)} ارجنٹ۔` },
        { q: 'کیا پاسپورٹ آفس میں نقد فیس جمع ہو سکتی ہے؟', a: 'اے آر وائی نیوز کی رپورٹ کے مطابق پاسپورٹ دفاتر میں نقد ادائیگی بند ہو چکی ہے اور فیس آن لائن کیش لیس نظام سے ادا ہوتی ہے۔' },
        { q: 'کیا کوئی الگ فاسٹ ٹریک فیس ہے؟', a: 'ہم کوئی الگ فاسٹ ٹریک فیس نہیں دکھا رہے کیونکہ رپورٹس میں صرف عام اور ارجنٹ فیس ہے اور DGIP نے دوسری رقم کی تصدیق نہیں کی۔' },
      ]
    : [
        { q: 'How much is the e-passport fee in Pakistan?', a: `As reported: 5 years, 36 pages is ${rs(f(5, 36).normal)} normal and ${rs(f(5, 36).urgent)} urgent; 10 years, 36 pages is ${rs(f(10, 36).normal)} normal and ${rs(f(10, 36).urgent)} urgent. Confirm the current amount with DGIP.` },
        { q: 'Passport fee kitni hai?', a: `5 saal 36 pages ki normal fee ${rs(f(5, 36).normal)} aur urgent ${rs(f(5, 36).urgent)} report hui hai. Poora chart upar hai; DGIP se confirm kar lein.` },
        { q: 'What is the fee for a 72-page passport?', a: `5 years: ${rs(f(5, 72).normal)} normal, ${rs(f(5, 72).urgent)} urgent. 10 years: ${rs(f(10, 72).normal)} normal, ${rs(f(10, 72).urgent)} urgent.` },
        { q: 'Can I pay the fee in cash at the passport office?', a: 'According to ARY News, cash payment at passport offices has been discontinued and fees are paid through an online cashless system.' },
        { q: 'Is there a separate fast-track fee?', a: 'Zaviya shows no separate fast-track fee: the reports list only normal and urgent fees, and DGIP has not confirmed any other figure.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'ای پاسپورٹ فیس' : 'E-passport fee', url: localePath(locale, '/passport-fee-pakistan') },
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
            › {isUr ? 'ای پاسپورٹ فیس' : 'E-passport fee'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'پاکستان ای پاسپورٹ فیس 2026' : 'Pakistan e-passport fee chart 2026'}
          </h1>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? `رپورٹ شدہ فیس، ماخذ DGIP کا اعلان۔ معلومات کی تاریخ: ${asOf}۔ ہم نے DGIP کا اصل نوٹیفکیشن نہیں دیکھا، اس لیے درخواست سے پہلے سرکاری سائٹ سے تصدیق کریں۔`
              : `Fees as reported by ProPakistani and ARY News from the Directorate General of Immigration and Passports (DGIP). As of ${asOf}. Neither report links the DGIP notice itself, so confirm on the official site before you pay.`}
          </p>
          <p className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm">
            {isUr ? 'خلاصہ (رومن اردو): 5 saal 36 pages ki normal fee Rs9,000, urgent Rs15,000. Cash band, online payment.' : 'In short (Roman Urdu): 5 saal 36 pages ki normal fee Rs9,000, urgent Rs15,000. Cash band, online payment.'}
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'اپنی فیس چنیں' : 'Pick your passport'}</h2>
          <div className="mt-3">
            <PassportFeePicker isUr={isUr} />
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'فیس چارٹ' : 'Fee chart'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className="py-2 text-start">{isUr ? 'مدت' : 'Validity'}</th>
                  <th className="py-2 text-start">{isUr ? 'صفحات' : 'Pages'}</th>
                  <th className="py-2 text-start">{isUr ? 'عام' : 'Normal'}</th>
                  <th className="py-2 text-start">{isUr ? 'ارجنٹ' : 'Urgent'}</th>
                </tr>
              </thead>
              <tbody>
                {FEES.map((x) => (
                  <tr key={`${x.years}-${x.pages}`} className="border-b border-border">
                    <td className="py-2">{isUr ? `${x.years} سال` : `${x.years} years`}</td>
                    <td className="py-2">{x.pages}</td>
                    <td className="py-2 font-semibold">{rs(x.normal)}</td>
                    <td className="py-2 font-semibold">{rs(x.urgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ادائیگی اور درخواست' : 'How to pay and apply'}</h2>
          <ol className="mt-3 list-decimal space-y-1 ps-5">
            {(isUr
              ? [
                  'DGIP کی سرکاری ویب سائٹ یا ایپ پر جا کر ای پاسپورٹ کی درخواست شروع کریں۔',
                  'مدت (5 یا 10 سال)، صفحات (36 یا 72) اور عام یا ارجنٹ سروس منتخب کریں۔',
                  'فیس آن لائن ادا کریں؛ رپورٹس کے مطابق پاسپورٹ دفاتر میں نقد ادائیگی بند ہے۔',
                  'اپنا شناختی کارڈ (بچوں کے لیے ب فارم) اور دیگر مطلوبہ دستاویزات ساتھ رکھیں، اور DGIP کی فہرست سے ملا لیں۔',
                ]
              : [
                  'Start the e-passport application on the official DGIP website or app.',
                  'Choose validity (5 or 10 years), pages (36 or 72) and normal or urgent service.',
                  'Pay the fee online; reports say cash is no longer accepted at passport offices.',
                  'Keep your CNIC (B-form for children) and the other required documents ready, and check them against the DGIP list.',
                ]
            ).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-fg-muted">
            {isUr ? 'ہم درخواست یا ادائیگی نہیں لیتے۔ ہر مرحلہ DGIP کی سائٹ پر ہوتا ہے۔' : 'Zaviya does not take applications or payments; every step happens on the DGIP site.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ذرائع' : 'Sources'}</h2>
          <ul className="mt-3 space-y-1">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} rel="noopener" className="underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
