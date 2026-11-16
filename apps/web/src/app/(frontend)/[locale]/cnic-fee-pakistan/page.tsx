import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { AGE_FEES, CNIC, CNIC_FEES, NICOP_FEES, cnicFee, rsOrDash } from '@/lib/cnic-fees'

export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'نادرا شناختی کارڈ فیس 2026: عام، ارجنٹ اور ایگزیکٹو' : 'NADRA ID Card Fee 2026: CNIC and Smart Card, Normal, Urgent, Executive',
    description:
      locale === 'ur'
        ? 'نادرا کی سرکاری فیس: نیا شناختی کارڈ، تجدید، ڈپلیکیٹ، اسمارٹ کارڈ، بچوں کا کارڈ اور نائیکوپ۔ ہر کیٹیگری میں کتنے دن لگتے ہیں۔'
        : "NADRA's official fees for a new CNIC, renewal, duplicate and Smart NIC, plus CRC and NICOP, with the days each normal, urgent and executive card takes.",
    enPath: '/cnic-fee-pakistan',
    urPath: '/ur/cnic-fee-pakistan',
    absoluteTitle: true,
  })
}

export default async function CnicFeePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const asOf = new Date(`${CNIC.asOf}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const renew = cnicFee('cnic-renewal')
  const smart = cnicFee('snic-new')
  const first = cnicFee('new-cnic')
  const r = rsOrDash

  const faqs = isUr
    ? [
        { q: 'نیا شناختی کارڈ بنوانے کی فیس کتنی ہے؟', a: `پہلا شناختی کارڈ عام کیٹیگری میں مفت ہے (${first.days[0]} دن)۔ ارجنٹ ${r(first.urgent)} (${first.days[1]} دن) اور ایگزیکٹو ${r(first.executive)} (${first.days[2]} دن)۔` },
        { q: 'ID card fee kitni hai?', a: `Renewal ki normal fee ${r(renew.normal)}, urgent ${r(renew.urgent)}, executive ${r(renew.executive)}. Smart card: ${r(smart.normal)} / ${r(smart.urgent)} / ${r(smart.executive)}. Pehla card normal mein free hai.` },
        { q: 'اسمارٹ کارڈ کی فیس کتنی ہے؟', a: `عام ${r(smart.normal)} (${smart.days[0]} دن)، ارجنٹ ${r(smart.urgent)} (${smart.days[1]} دن)، ایگزیکٹو ${r(smart.executive)} (${smart.days[2]} دن)۔` },
        { q: 'شناختی کارڈ کتنے سال کے لیے بنتا ہے؟', a: 'نادرا کے مطابق بالغوں کا شناختی کارڈ، اسمارٹ کارڈ اور نائیکوپ 10 سال کے لیے ہوتا ہے۔' },
        { q: 'کارڈ گھر پر منگوانے کا کتنا خرچ ہے؟', a: `پاکستان کے اندر ڈیلیوری چارجز ${r(CNIC.deliveryPk)} ہیں۔` },
      ]
    : [
        { q: 'What is the NADRA fee for a new ID card?', a: `Your first CNIC is free in the normal category (${first.days[0]} days). Urgent costs ${r(first.urgent)} (${first.days[1]} days) and executive ${r(first.executive)} (${first.days[2]} days).` },
        { q: 'ID card fee kitni hai?', a: `Renewal ki normal fee ${r(renew.normal)}, urgent ${r(renew.urgent)}, executive ${r(renew.executive)}. Smart card: ${r(smart.normal)} / ${r(smart.urgent)} / ${r(smart.executive)}. Pehla card normal mein free hai.` },
        { q: 'How much is the Smart NIC fee?', a: `Normal ${r(smart.normal)} (${smart.days[0]} days), urgent ${r(smart.urgent)} (${smart.days[1]} days), executive ${r(smart.executive)} (${smart.days[2]} days).` },
        { q: 'How long is a CNIC valid?', a: 'NADRA says a CNIC, Smart CNIC or NICOP for adults is valid for 10 years.' },
        { q: 'How much is home delivery of the card?', a: `NADRA lists delivery within Pakistan at ${r(CNIC.deliveryPk)}.` },
      ]

  const days = (d: number | null) => (d === null ? '' : isUr ? ` · ${d} دن` : ` · ${d} ${d === 1 ? 'day' : 'days'}`)

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'شناختی کارڈ فیس' : 'CNIC fee', url: localePath(locale, '/cnic-fee-pakistan') },
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
            › {isUr ? 'شناختی کارڈ فیس' : 'CNIC fee'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'نادرا شناختی کارڈ فیس 2026' : 'NADRA ID card (CNIC) fee 2026'}
          </h1>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? `یہ فیس نادرا کی اپنی ویب سائٹ کے فیس صفحے سے لی گئی ہے (نادرا کے مطابق آخری اپڈیٹ: ${asOf})۔`
              : `Fees taken from NADRA's own fee page (NADRA's last update: ${asOf}). Days are NADRA's processing times, counted from when you pay.`}
          </p>
          <p dir="ltr" className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm">
            {`${isUr ? 'خلاصہ (رومن اردو)' : 'In short (Roman Urdu)'}: Pehla ID card normal mein free. Renewal ${r(renew.normal)} normal, ${r(renew.urgent)} urgent, ${r(renew.executive)} executive. Smart card ${r(smart.normal)} se shuru.`}
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'شناختی کارڈ اور اسمارٹ کارڈ فیس' : 'CNIC and Smart NIC fee chart'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className="py-2 text-start">{isUr ? 'کارڈ' : 'Card'}</th>
                  <th className="py-2 text-start">{isUr ? 'عام' : 'Normal'}</th>
                  <th className="py-2 text-start">{isUr ? 'ارجنٹ' : 'Urgent'}</th>
                  <th className="py-2 text-start">{isUr ? 'ایگزیکٹو' : 'Executive'}</th>
                </tr>
              </thead>
              <tbody>
                {CNIC_FEES.map((x) => (
                  <tr key={x.key} className="border-b border-border">
                    <td className="py-2 pe-3">{isUr ? x.ur : x.en}</td>
                    <td className="py-2 font-semibold">
                      {r(x.normal)}
                      <span className="font-normal text-fg-muted text-sm">{days(x.days[0])}</span>
                    </td>
                    <td className="py-2 font-semibold">
                      {r(x.urgent)}
                      <span className="font-normal text-fg-muted text-sm">{days(x.days[1])}</span>
                    </td>
                    <td className="py-2 font-semibold">
                      {r(x.executive)}
                      <span className="font-normal text-fg-muted text-sm">{days(x.days[2])}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr ? `پاکستان کے اندر کارڈ کی ڈیلیوری: ${r(CNIC.deliveryPk)}۔ کارڈ 10 سال کے لیے کارآمد ہے۔` : `Delivery within Pakistan: ${r(CNIC.deliveryPk)}. Adult cards are valid for 10 years.`}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'نائیکوپ فیس (بیرون ملک پاکستانی)' : 'Smart NICOP fee (overseas Pakistanis)'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className="py-2 text-start">{isUr ? 'زون' : 'Zone'}</th>
                  <th className="py-2 text-start">{isUr ? 'عام' : 'Normal'}</th>
                  <th className="py-2 text-start">{isUr ? 'ارجنٹ' : 'Urgent'}</th>
                  <th className="py-2 text-start">{isUr ? 'ایگزیکٹو' : 'Executive'}</th>
                </tr>
              </thead>
              <tbody>
                {NICOP_FEES.map((z) => (
                  <tr key={z.zone} className="border-b border-border">
                    <td className="py-2 pe-3">{isUr ? z.ur : z.en}</td>
                    <td className="py-2 font-semibold">USD {z.normal}</td>
                    <td className="py-2 font-semibold">USD {z.urgent}</td>
                    <td className="py-2 font-semibold">USD {z.executive}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr
              ? 'نئے، تجدید اور تبدیلی کے لیے یہی فیس ہے۔ نادرا کے مطابق فیس سرکاری شرح پر روپے میں بھی دی جا سکتی ہے۔'
              : 'The same fee applies to new, renewal and modification. NADRA says the fee can be paid in rupees at the official conversion rate.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'عمر میں تبدیلی کی فیس' : 'Age correction fee'}</h2>
          <ul className="mt-3 space-y-1">
            {AGE_FEES.map((a) => (
              <li key={a.en}>
                {isUr ? a.ur : a.en}: <span className="font-semibold">{r(a.inland)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ذریعہ' : 'Source'}</h2>
          <p className="mt-3">
            <a href={CNIC.officialUrl} rel="noopener" className="underline">
              {isUr ? 'نادرا: فیس اسٹرکچر (سرکاری)' : 'NADRA: Fee Structure (official)'}
            </a>
            {isUr ? '۔ ہیلپ لائن 1777۔' : '. Helpline 1777.'}
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr ? 'زاویہ درخواست یا فیس نہیں لیتا۔' : 'Zaviya takes no applications or payments. Also see the '}
            {!isUr && (
              <Link href={localePath(locale, '/passport-fee-pakistan')} className="underline">
                e-passport fee chart
              </Link>
            )}
            {!isUr && (
              <>
                {' and the '}
                <Link href={localePath(locale, '/driving-licence-fee-punjab')} className="underline">
                  Punjab driving licence fee
                </Link>
              </>
            )}
            {!isUr && '.'}
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
