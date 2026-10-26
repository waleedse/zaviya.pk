import Link from 'next/link'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { DEADLINE, daysToDeadline, SOURCES } from '@/lib/tax-return-deadline'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title:
      locale === 'ur'
        ? 'انکم ٹیکس ریٹرن کی آخری تاریخ 31 اکتوبر 2026 | IRIS پر فائل کرنے کا طریقہ'
        : 'FBR Tax Return Last Date 31 October 2026: How to File on IRIS',
    description:
      locale === 'ur'
        ? 'ایف بی آر نے ٹیکس سال 2026 کے انکم ٹیکس ریٹرن کی آخری تاریخ 31 اکتوبر 2026 کر دی۔ IRIS پر ریٹرن فائل کرنے کے مراحل اور ویلتھ اسٹیٹمنٹ کی وارننگ۔'
        : 'FBR has extended the Tax Year 2026 income tax return deadline to 31 October 2026. Who is covered, how to file on the IRIS portal, and the wealth statement mistake that blocks submission.',
    enPath: '/income-tax-return-deadline-pakistan',
    urPath: '/ur/income-tax-return-deadline-pakistan',
    absoluteTitle: true,
  })
}

const dateLabel = (iso: string, isUr: boolean) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function TaxReturnDeadlinePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const days = daysToDeadline()
  const deadline = dateLabel(DEADLINE.date, isUr)

  const countdown = isUr
    ? days > 1
      ? `آخری تاریخ میں ${days} دن باقی ہیں۔`
      : days === 1
        ? 'آخری تاریخ کل ہے۔'
        : days === 0
          ? 'آخری تاریخ آج ہے۔'
          : 'یہ آخری تاریخ گزر چکی ہے۔ نئی تاریخ کے لیے ایف بی آر کا اعلان دیکھیں۔'
    : days > 1
      ? `${days} days left.`
      : days === 1
        ? 'The deadline is tomorrow.'
        : days === 0
          ? 'The deadline is today.'
          : 'This deadline has passed. Check FBR for any new date.'

  const steps = isUr
    ? [
        'iris.fbr.gov.pk پر اپنے یوزر آئی ڈی اور پاس ورڈ سے لاگ اِن کریں۔',
        'ریٹرن جمع کرانے کا آپشن (Submit return) کھولیں اور ٹیکس سال منتخب کریں۔',
        'آمدن کے ذرائع (تنخواہ، کاروبار، جائیداد وغیرہ) کا اندراج کریں۔',
        'ویلتھ اسٹیٹمنٹ بھریں اور اسے ریٹرن کے ساتھ ریکنسائل کریں۔',
        'تمام اندراجات دوبارہ دیکھیں، پھر موبائل پر آنے والے PIN سے ریٹرن جمع کرائیں۔',
        'جمع ہونے کے بعد ریٹرن کی رسید محفوظ کر لیں۔',
      ]
    : [
        'Log in at iris.fbr.gov.pk with your user ID and password.',
        'Open the option to submit a return and select the tax period (Tax Year 2026).',
        'Enter your sources of income (salary, business, property and so on).',
        'Fill in the wealth statement and reconcile it with the return.',
        'Review every entry, then submit using the PIN sent to your registered mobile number.',
        'Save the acknowledgement once the return is submitted.',
      ]

  const faqs = isUr
    ? [
        { q: 'انکم ٹیکس ریٹرن کی آخری تاریخ کب ہے؟', a: `ٹیکس سال ${DEADLINE.taxYear} کے لیے آخری تاریخ ${deadline} ہے (${DEADLINE.circular})۔ پہلے یہ تاریخ ${dateLabel(DEADLINE.previousDate, true)} تھی۔` },
        { q: 'ٹیکس ریٹرن کی last date kab hai؟', a: `Tax return ki last date ${deadline} hai. Is se pehle IRIS par login karke return submit kar dein.` },
        { q: 'ریٹرن کہاں فائل کریں؟', a: 'ایف بی آر کے IRIS پورٹل iris.fbr.gov.pk پر۔ ہم آپ کی جانب سے ریٹرن فائل نہیں کرتے۔' },
        { q: 'ویلتھ اسٹیٹمنٹ کیوں ضروری ہے؟', a: 'ویلتھ اسٹیٹمنٹ اور ریٹرن میں فرق ہو تو ریٹرن جمع ہونے میں رکاوٹ آ سکتی ہے، اس لیے جمع کرانے سے پہلے دونوں کا ریکنسائل کریں۔' },
      ]
    : [
        { q: 'What is the last date to file the income tax return?', a: `For Tax Year ${DEADLINE.taxYear} the deadline is ${deadline}, under ${DEADLINE.circular}. The earlier date was ${dateLabel(DEADLINE.previousDate, false)}.` },
        { q: 'Tax return ki last date kab hai?', a: `Tax return ki last date ${deadline} hai. Us se pehle IRIS par login karke return submit kar dein.` },
        { q: 'Where do I file my return?', a: 'On the FBR IRIS portal at iris.fbr.gov.pk. Zaviya does not file returns on your behalf.' },
        { q: 'Why does the wealth statement matter?', a: 'If the wealth statement and the return do not reconcile, submission can be blocked, so reconcile both before you submit.' },
        { q: 'I am salaried. Is there anything extra?', a: 'Where salary is more than half of your income, FBR’s guide refers to Declaration Form 114(I). Check the FBR filing guide linked below for the current requirement.' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'ٹیکس ریٹرن آخری تاریخ' : 'Tax return deadline', url: localePath(locale, '/income-tax-return-deadline-pakistan') },
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
            › {isUr ? 'ٹیکس ریٹرن آخری تاریخ' : 'Tax return deadline'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'انکم ٹیکس ریٹرن کی آخری تاریخ 31 اکتوبر 2026' : 'FBR tax return last date: 31 October 2026'}
          </h1>
          <div className="rounded-2xl border border-border bg-bg p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{isUr ? `ٹیکس سال ${DEADLINE.taxYear} کی آخری تاریخ` : `Tax Year ${DEADLINE.taxYear} deadline`}</p>
            <p className="mt-1 font-display text-4xl font-extrabold">{deadline}</p>
            <p className="mt-2 text-fg-muted">
              {countdown} {DEADLINE.circular}. {isUr ? 'معلومات کی تاریخ' : 'As of'} {dateLabel(DEADLINE.asOf, isUr)}.
            </p>
          </div>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'کون شامل ہے' : 'Who is covered'}</h2>
          <p className="mt-2 text-fg-muted">
            {isUr
              ? `یہ توسیع ان افراد اور AOP کے لیے ہے جن کی تاریخ پہلے ${dateLabel(DEADLINE.previousDate, true)} تک بڑھائی گئی تھی۔ اپنی صورتِ حال کے لیے سرکاری سرکلر دیکھیں۔`
              : `The extension applies to individuals and associations of persons whose date had earlier been moved to ${dateLabel(DEADLINE.previousDate, false)}. Read the official circular for your own case.`}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'IRIS پر ریٹرن کیسے فائل کریں' : 'How to file on IRIS'}</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-fg-muted">
            {isUr ? 'پورٹل کی اسکرینیں بدل سکتی ہیں۔ تازہ ہدایات کے لیے ایف بی آر کی گائیڈ دیکھیں۔ ہم آپ کی جانب سے ریٹرن فائل نہیں کرتے۔' : 'Portal screens can change; follow FBR’s own guide for the current layout. Zaviya does not file returns for you.'}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold">{isUr ? 'ویلتھ اسٹیٹمنٹ کی وارننگ' : 'Wealth statement warning'}</h2>
          <p className="mt-2 text-fg-muted">
            {isUr
              ? 'ویلتھ اسٹیٹمنٹ اور ریٹرن کا ریکنسائل نہ ہو تو جمع کرانا رک سکتا ہے۔ آخری دن کا انتظار نہ کریں، پورٹل پر رش ہو سکتا ہے۔'
              : 'If the wealth statement and the return do not reconcile, submission can fail. Do not wait for the last day: the portal can be busy near deadlines.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'سرکاری ذرائع' : 'Official sources'}</h2>
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
