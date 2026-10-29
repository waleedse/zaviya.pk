import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { CHICKEN, CITIES, SOURCES, TREND, change, rsKg } from '@/lib/chicken-price'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'پاکستان میں مرغی کا ریٹ: 17 شہروں کی ہفتہ وار قیمت' : 'Chicken Price in Pakistan: Live Broiler Rate, 17 Cities (PBS Weekly)',
    description:
      locale === 'ur'
        ? 'پی بی ایس کی ہفتہ وار رپورٹ کے مطابق زندہ برائلر مرغی کی قیمت، 17 شہروں کی فہرست اور پانچ ہفتے کا رجحان۔'
        : 'Live broiler chicken price in Pakistan from the weekly PBS SPI: national average, 17 cities, week-on-week change and five-week trend. Live bird, not cleaned meat.',
    enPath: '/chicken-price-pakistan',
    urPath: '/ur/chicken-price-pakistan',
    absoluteTitle: true,
  })
}

const signed = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}`

export default async function ChickenPricePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const wk = fmt(CHICKEN.weekEnded)
  const karachi = CITIES.find((c) => c.city === 'Karachi')!
  const lahore = CITIES.find((c) => c.city === 'Lahore')!
  const delta = change(CHICKEN.nationalAvg, CHICKEN.previousWeek)

  const faqs = isUr
    ? [
        { q: 'آج مرغی کا ریٹ کیا ہے؟', a: `پی بی ایس کے مطابق ${wk} کو ختم ہونے والے ہفتے میں زندہ برائلر کا قومی اوسط ${rsKg(CHICKEN.nationalAvg)} فی کلو رہا، یعنی ہفتہ وار ${CHICKEN.wowPct}% اضافہ۔` },
        { q: 'Murghi ka rate kitna hai?', a: `PBS ke hisaab se ${wk} wale hafte mein zinda (live) broiler ka average ${rsKg(CHICKEN.nationalAvg)} per kg raha, pichle hafte se ${rsKg(delta)} zyada. Safai ke baad ka gosht mehnga hota hai; PBS woh rate nahi deta.` },
        { q: 'کیا یہ گوشت کی قیمت ہے؟', a: 'نہیں۔ پی بی ایس زندہ پرندے کی قیمت وزن کے حساب سے لیتا ہے۔ صاف شدہ گوشت زیادہ مہنگا ہوتا ہے اور اس کی قیمت پی بی ایس شائع نہیں کرتا۔' },
        { q: 'کراچی اور لاہور میں ریٹ کیا ہے؟', a: `کراچی ${rsKg(karachi.now)} اور لاہور ${rsKg(lahore.now)} فی کلو (زندہ برائلر)۔` },
      ]
    : [
        { q: 'What is the chicken price in Pakistan today?', a: `PBS puts the national average for live broiler at ${rsKg(CHICKEN.nationalAvg)} per kg in the week ended ${wk}, up ${CHICKEN.wowPct}% on the week. PBS publishes weekly, so there is no true daily rate.` },
        { q: 'Murghi ka rate kitna hai?', a: `PBS ke hisaab se ${wk} wale hafte mein zinda (live) broiler ka average ${rsKg(CHICKEN.nationalAvg)} per kg raha, pichle hafte se ${rsKg(delta)} zyada. Safai ke baad ka gosht mehnga hota hai; PBS woh rate nahi deta.` },
        { q: 'Is this the price of chicken meat?', a: 'No. PBS records the live bird price by weight. Cleaned meat costs more per kilo and PBS does not publish that price.' },
        { q: 'What is the chicken rate in Karachi and Lahore?', a: `Karachi ${rsKg(karachi.now)} and Lahore ${rsKg(lahore.now)} per kg of live broiler, as read from the PBS city table.` },
        { q: 'When does the price update?', a: 'PBS releases the weekly SPI on Thursday or Friday; Zaviya updates this page after each release.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'مرغی کا ریٹ' : 'Chicken price', url: localePath(locale, '/chicken-price-pakistan') },
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
            › {isUr ? 'مرغی کا ریٹ' : 'Chicken price'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'پاکستان میں مرغی کا ریٹ' : 'Chicken price in Pakistan'}
          </h1>
          <p className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm font-semibold">
            {isUr
              ? 'یہ زندہ برائلر مرغی کا ریٹ (وزن کے حساب سے) ہے، صاف شدہ گوشت کا نہیں۔ صاف گوشت اس سے مہنگا ملتا ہے۔'
              : 'This is the live broiler price by weight, not cleaned meat. Cleaned meat costs more per kilo and is not in the PBS survey.'}
          </p>
          <dl className="grid max-w-[720px] grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-fg-muted">{isUr ? 'قومی اوسط' : 'National average'}</dt>
              <dd className="font-display text-3xl font-extrabold">{rsKg(CHICKEN.nationalAvg)}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-muted">{isUr ? 'ہفتہ وار' : 'Week on week'}</dt>
              <dd className="font-display text-3xl font-extrabold">+{CHICKEN.wowPct}%</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-muted">{isUr ? 'سال بہ سال' : 'Year on year'}</dt>
              <dd className="font-display text-3xl font-extrabold">+{CHICKEN.yoyPct}%</dd>
            </div>
          </dl>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? `پی بی ایس کا ہفتہ وار سینسٹو پرائس انڈیکیٹر، ہفتہ ختم: ${wk}۔ فی کلو، زندہ وزن۔ پی بی ایس ہر جمعرات یا جمعہ کو نیا ڈیٹا جاری کرتا ہے؛ ہم درمیانی ہفتے کا کوئی ریٹ نہیں دکھاتے۔`
              : `Pakistan Bureau of Statistics weekly Sensitive Price Indicator, week ended ${wk}, per kg live weight. PBS publishes on Thursday or Friday; we never show a mid-week rate.`}
          </p>
          <p className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm">
            In short (Roman Urdu): murghi (zinda broiler) ka average Rs444.27 per kg, pichle hafte se 12.2% mehngi.
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? '17 شہروں میں ریٹ' : 'Price in 17 cities'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className="py-2 text-start">{isUr ? 'شہر' : 'City'}</th>
                  <th className="py-2 text-start">{isUr ? 'اس ہفتے' : 'This week'}</th>
                  <th className="py-2 text-start">{isUr ? 'پچھلا ہفتہ' : 'Last week'}</th>
                  <th className="py-2 text-start">{isUr ? 'فرق' : 'Change'}</th>
                </tr>
              </thead>
              <tbody>
                {CITIES.map((c) => (
                  <tr key={c.city} className="border-b border-border">
                    <td className="py-2">{c.city}</td>
                    <td className="py-2 font-semibold">{rsKg(c.now)}</td>
                    <td className="py-2">{rsKg(c.prev)}</td>
                    <td className="py-2">{signed(change(c.now, c.prev))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr
              ? 'روپے فی کلو، زندہ وزن۔ شہر کی قیمتیں پی بی ایس کے شہر وار ٹیبل سے پاکستان ایرا کی پڑھی ہوئی ہیں۔'
              : 'Rs per kg live weight. City figures are as read from the PBS city table by Pakistan Era; the national figures are from the PBS summary.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'پانچ ہفتے کا رجحان' : 'Five-week trend'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-start">
              <tbody>
                {TREND.map((t, i) => (
                  <tr key={t.week} className="border-b border-border">
                    <td className="py-2">{fmt(t.week)}</td>
                    <td className="py-2 font-semibold">{rsKg(t.value)}</td>
                    <td className="py-2 text-fg-muted">{i > 0 ? signed(change(t.value, TREND[i - 1]!.value)) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'زندہ مرغی اور گوشت کا فرق' : 'Live bird vs meat'}</h2>
          <p className="mt-2">
            {isUr
              ? 'پی بی ایس پرندے کا وزن زندہ حالت میں لیتا ہے۔ صفائی کے بعد پر، خون اور کچھ حصے نکل جاتے ہیں، اس لیے دکان پر گوشت کا ریٹ زیادہ ہوتا ہے۔ پہلے دکاندار سے زندہ وزن کا ریٹ پوچھیں، پھر صاف گوشت کا۔ ضلعی انتظامیہ کی سرکاری ریٹ لسٹ ہو تو وہی حد ہے، پی بی ایس کا اوسط نہیں۔'
              : 'PBS weighs the bird alive. After cleaning, feathers, blood and some parts are gone, so the shop price for meat is higher. Ask your shop for the live-weight rate first, then the cleaned-meat rate. Where your district administration issues an official price list, that list is the limit, not the PBS average.'}
          </p>
          <p className="mt-3 text-sm">
            <Link href={localePath(locale, '/petrol-price-today-pakistan')} className="font-semibold underline">
              {isUr ? 'آج کا پیٹرول ریٹ' : 'Petrol price today'}
            </Link>
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
