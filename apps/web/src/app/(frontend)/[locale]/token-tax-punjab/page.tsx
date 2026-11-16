import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { BIKE_REGISTRATION, CAR_ROWS, TOKEN, TRANSFER_FEE, rs, tokenTax } from '@/lib/token-tax-punjab'

export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'ٹوکن ٹیکس 2026-27 پنجاب: کار اور موٹر سائیکل کے ریٹ' : 'Token Tax 2026-27 Punjab: Car and Bike Rates by Engine CC',
    description:
      locale === 'ur'
        ? 'پنجاب ایکسائز کے سرکاری ریٹ: 2026-27 کا ٹوکن ٹیکس (انوائس قیمت کا 0.3٪ یا 0.4٪)، فائلر اور نان فائلر انکم ٹیکس، ٹرانسفر فیس۔'
        : 'Official Punjab Excise rates for 2026-27: token tax by engine size (0.3% or 0.4% of invoice price above 1000cc), filer and non-filer income tax, and transfer fees.',
    enPath: '/token-tax-punjab',
    urPath: '/ur/token-tax-punjab',
    absoluteTitle: true,
  })
}

export default async function TokenTaxPunjabPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const readOn = new Date(`${TOKEN.readOn}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const c1300 = CAR_ROWS.find((r) => r.en === '1300cc')!
  const example = 5_000_000
  const exTax = tokenTax(c1300, example)

  const tokenCell = (r: (typeof CAR_ROWS)[number]) =>
    'rs' in r.token
      ? `${rs(r.token.rs)}${r.token.lifetime ? (isUr ? ' (لائف ٹائم)' : ' (lifetime)') : ''}`
      : isUr
        ? `انوائس قیمت کا ${r.token.pctOfInvoice}٪`
        : `${r.token.pctOfInvoice}% of invoice price`

  const faqs = isUr
    ? [
        { q: '2026-27 میں کار کا ٹوکن ٹیکس کتنا ہے؟', a: `پنجاب ایکسائز کے مطابق 1001 سے 2000 سی سی تک انوائس قیمت کا 0.3٪ اور 2000 سی سی سے زیادہ پر 0.4٪۔ 1000 سی سی تک کار پر ${rs(20000)} لائف ٹائم ٹوکن۔` },
        { q: 'Token tax kitna hai?', a: `1001-2000cc: invoice price ka 0.3%. Misal: Rs50 lakh ki 1300cc car par ${rs(exTax)}. 2000cc se upar 0.4%. 1000cc tak ${rs(20000)} lifetime.` },
        { q: 'نان فائلر کو کتنا انکم ٹیکس دینا پڑتا ہے؟', a: `ٹوکن کے ساتھ انکم ٹیکس: مثلاً 1300 سی سی پر فائلر ${rs(c1300.incomeFiler!)} اور نان فائلر ${rs(c1300.incomeNonFiler!)}۔ پوری فہرست اوپر جدول میں ہے۔` },
        { q: 'ٹوکن ٹیکس پر رعایت ملتی ہے؟', a: `جی، اگر پورے سال کا ٹیکس ${TOKEN.rebateBy} تک ادا کیا جائے تو ${TOKEN.rebatePct}٪ رعایت ملتی ہے۔` },
        { q: 'ٹوکن ٹیکس کہاں ادا کریں؟', a: 'پنجاب حکومت کے ای پے (ePay Punjab) پر حساب لگا کر آن لائن ادائیگی ہوتی ہے۔' },
      ]
    : [
        { q: 'What is the car token tax in Punjab for 2026-27?', a: `Punjab Excise lists 0.3% of the invoice price for 1001 to 2000cc and 0.4% above 2000cc. Cars up to 1000cc pay a ${rs(20000)} lifetime token.` },
        { q: 'Token tax kitna hai?', a: `1001-2000cc: invoice price ka 0.3%. Misal: Rs50 lakh ki 1300cc car par ${rs(exTax)}. 2000cc se upar 0.4%. 1000cc tak ${rs(20000)} lifetime.` },
        { q: 'How much income tax does a non-filer pay with the token?', a: `For example, at 1300cc a filer pays ${rs(c1300.incomeFiler!)} and a non-filer ${rs(c1300.incomeNonFiler!)}. The full list is in the table.` },
        { q: 'Is there a discount for paying early?', a: `Yes: a ${TOKEN.rebatePct}% rebate if the whole year's tax is paid by ${TOKEN.rebateBy} of the financial year.` },
        { q: 'Where do I pay the token tax?', a: "Online through the Punjab government's ePay Punjab, which also has the official calculator." },
      ]

  const th = 'py-2 pe-3 text-start'
  const td = 'py-2 pe-3'
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'ٹوکن ٹیکس پنجاب' : 'Token tax Punjab', url: localePath(locale, '/token-tax-punjab') },
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
            › {isUr ? 'ٹوکن ٹیکس پنجاب' : 'Token tax Punjab'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? `پنجاب ٹوکن ٹیکس ${TOKEN.year}` : `Punjab token tax ${TOKEN.year}`}
          </h1>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? `یہ ریٹ پنجاب ایکسائز اینڈ ٹیکسیشن کی سرکاری ویب سائٹ سے ${readOn} کو لیے گئے ہیں۔`
              : `Rates from the Punjab Excise & Taxation Department's official site, read on ${readOn}. Above 1000cc the 2026-27 token tax is a share of the car's invoice price, so the amount differs by model.`}
          </p>
          <p dir="ltr" className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm">
            {`${isUr ? 'خلاصہ (رومن اردو)' : 'In short (Roman Urdu)'}: 1000cc tak ${rs(20000)} lifetime. 1001-2000cc invoice price ka 0.3% (Rs50 lakh ki car = ${rs(exTax)}). 2000cc se upar 0.4%. 31 August tak poora saal bharein to 10% kam.`}
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[900px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'کار اور موٹر سائیکل: ٹوکن، انکم اور پروفیشنل ٹیکس' : 'Cars and bikes: token, income and professional tax'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className={th}>{isUr ? 'انجن' : 'Engine'}</th>
                  <th className={th}>{isUr ? `ٹوکن ${TOKEN.year}` : `Token ${TOKEN.year}`}</th>
                  <th className={th}>{isUr ? 'پچھلا سال' : '2025-26'}</th>
                  <th className={th}>{isUr ? 'انکم ٹیکس فائلر' : 'Income tax filer'}</th>
                  <th className={th}>{isUr ? 'نان فائلر' : 'Non-filer'}</th>
                  <th className={th}>{isUr ? 'پروفیشنل' : 'Professional'}</th>
                </tr>
              </thead>
              <tbody>
                {CAR_ROWS.map((r) => (
                  <tr key={r.en} className="border-b border-border">
                    <td className={td}>{isUr ? r.ur : r.en}</td>
                    <td className={`${td} font-semibold`}>{tokenCell(r)}</td>
                    <td className={`${td} text-sm text-fg-muted`}>{r.prevYear}</td>
                    <td className={td}>{r.incomeFiler === null ? '–' : rs(r.incomeFiler)}</td>
                    <td className={td}>{r.incomeNonFiler === null ? '–' : rs(r.incomeNonFiler)}</td>
                    <td className={td}>{rs(r.professional)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr
              ? `مثال: 50 لاکھ روپے انوائس قیمت والی 1300 سی سی کار کا ٹوکن ${rs(exTax)} بنتا ہے (0.3٪)۔ ${TOKEN.rebateBy} تک پورے سال کی ادائیگی پر ${TOKEN.rebatePct}٪ رعایت۔`
              : `Example: a 1300cc car with a Rs5,000,000 invoice price pays ${rs(exTax)} token tax (0.3%). Pay the whole year by ${TOKEN.rebateBy} for a ${TOKEN.rebatePct}% rebate.`}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'موٹر سائیکل رجسٹریشن فیس' : 'Motorcycle registration fee'}</h2>
          <ul className="mt-3 space-y-1">
            {BIKE_REGISTRATION.map((b) => (
              <li key={b.en}>
                {isUr ? b.ur : b.en}: <span className="font-semibold">{rs(b.rs)}</span>
              </li>
            ))}
            <li>{isUr ? '150 سی سی سے زیادہ: گاڑی کی قیمت کا 2٪' : 'Above 150cc: 2% of the vehicle value'}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ٹرانسفر فیس' : 'Transfer fee'}</h2>
          <ul className="mt-3 space-y-1">
            {TRANSFER_FEE.map((t) => (
              <li key={t.en}>
                {isUr ? t.ur : t.en}: <span className="font-semibold">{rs(t.rs)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ذریعہ' : 'Source'}</h2>
          <p className="mt-3">
            <a href={TOKEN.url} rel="noopener" className="underline">
              {isUr ? 'پنجاب ایکسائز: موٹر وہیکل ٹیکس (سرکاری)' : 'Punjab Excise & Taxation: Motor Vehicle Tax (official)'}
            </a>
            {' · '}
            <a href={TOKEN.calculator} rel="noopener" className="underline">
              {isUr ? 'ای پے پنجاب کیلکولیٹر' : 'ePay Punjab calculator'}
            </a>
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr ? 'زاویہ ٹیکس وصول نہیں کرتا۔ ' : 'Zaviya collects no tax or payments. See also: '}
            <Link href={localePath(locale, '/driving-licence-fee-punjab')} className="underline">
              {isUr ? 'ڈرائیونگ لائسنس فیس پنجاب' : 'Punjab driving licence fee'}
            </Link>
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
