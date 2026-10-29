import Link from 'next/link'
import { FuelReliefSmsBuilder } from '@/components/data/FuelReliefSmsBuilder'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { getRatesTicker } from '@/lib/queries'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { PROVINCES, RELIEF, SOURCES, netPetrolPrice } from '@/lib/fuel-relief'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'پیٹرول ریلیف 9771: رجسٹریشن، TOK، لیٹر کی حد' : 'Fuel Relief 9771 Pakistan: Register, TOK, Litres and Scam Warning',
    description:
      locale === 'ur'
        ? 'Rs100 فی لیٹر پیٹرول ریلیف: کون اہل ہے، 9771 پر REG اور TOK کیسے بھیجیں، صوبائی کوڈ اور دھوکے سے بچاؤ۔'
        : 'Rs100 per litre PM fuel relief: who is eligible, how to send REG and TOK to 9771, province codes, pump price after relief and scam warnings.',
    enPath: '/fuel-relief-9771-pakistan',
    urPath: '/ur/fuel-relief-9771-pakistan',
    absoluteTitle: true,
  })
}

export default async function FuelReliefPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const petrol = (await getRatesTicker('en').catch(() => [])).find((t) => t.series === 'petrol_super')
  const asOf = new Date(`${RELIEF.asOf}T12:00:00Z`).toLocaleDateString(isUr ? 'ur-PK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

  const faqs = isUr
    ? [
        { q: '9771 پر رجسٹر کیسے کریں؟', a: 'اپنے نام کی SIM سے 9771 پر پیغام بھیجیں: REG، 13 ہندسوں کا شناختی کارڈ، گاڑی کا نمبر، صوبہ اور رجسٹریشن کی تاریخ۔ اوپر بلڈر یہی ترتیب بناتا ہے۔' },
        { q: '9771 pe kaise register karein?', a: 'Apni SIM (jo aap ke CNIC par ho) se 9771 par "REG CNIC gaari-ka-number sooba tareekh" bhejein. Upar wala builder yehi message bana deta hai. Message free hai.' },
        { q: 'TOK کیا ہے؟', a: 'TOK kya hai: registration kamyab hone ke baad pump par jane se pehle 9771 par TOK bhejein. Jawab mein token number milta hai, woh pump ke staff ko dikhayein.' },
        { q: 'کیا ڈیزل بھی شامل ہے؟', a: 'ہمیں جو رپورٹس ملیں ان میں صرف پیٹرول پر Rs100 فی لیٹر ریلیف ہے۔ ڈیزل کے لیے کوئی نوٹیفائیڈ اصول نہیں دیکھا؛ توسیع کی خبر آنے پر یہ صفحہ بدلے گا۔' },
        { q: 'کیا کوئی فیس یا OTP لگتا ہے؟', a: 'نہیں۔ حکومت کے مطابق کوئی چارج نہیں اور وہ فون، واٹس ایپ یا ایس ایم ایس پر پیسے، OTP یا کوڈ نہیں مانگے گی۔' },
      ]
    : [
        { q: 'How do I register for the 9771 fuel relief?', a: 'From a SIM registered in your own name, send REG, your 13-digit CNIC, the vehicle number, the province where it is registered and the registration date to 9771. The builder above makes the message.' },
        { q: '9771 pe kaise register karein?', a: 'Apni SIM (jo aap ke CNIC par ho) se 9771 par "REG CNIC gaari-ka-number sooba tareekh" bhejein. Upar wala builder yehi message bana deta hai. Message free hai.' },
        { q: 'TOK kya hai?', a: 'Registration kamyab hone ke baad, pump par jane se pehle 9771 par TOK bhejein. Jawab mein token number milta hai; woh pump ke staff ko dikhayein.' },
        { q: 'Is diesel covered by the Rs100 relief?', a: 'Every report we read covers petrol only. We have not seen a notified rule extending it to diesel, so we do not show one. This page changes when an official expansion is announced.' },
        { q: 'Does it cost anything, or will anyone ask for an OTP?', a: 'No. The minister said the scheme carries no charges and that the government will not ask for money, an OTP or a code by phone, WhatsApp or SMS. Report anyone who does.' },
      ]

  const rows: [string, string][] = isUr
    ? [
        ['موٹر سائیکل، رکشہ، چنگچی، دو اور تین پہیوں والی گاڑیاں', 'ماہانہ 20 لیٹر تک'],
        ['800cc تک کی گاڑیاں', 'ماہانہ 30 لیٹر تک'],
      ]
    : [
        ['Motorcycles, rickshaws, Chingchis and other two- and three-wheelers', 'Up to 20 litres a month'],
        ['Cars up to 800cc', 'Up to 30 litres a month'],
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'پیٹرول ریلیف 9771' : 'Fuel relief 9771', url: localePath(locale, '/fuel-relief-9771-pakistan') },
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
            › {isUr ? 'پیٹرول ریلیف 9771' : 'Fuel relief 9771'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'پی ایم فیول ریلیف اسکیم 9771: Rs100 فی لیٹر' : 'PM Fuel Relief Scheme 9771: Rs100 off per litre'}
          </h1>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? `پیٹرول پر Rs${RELIEF.perLitre} فی لیٹر ریلیف، موٹر سائیکل، رکشہ اور 800cc تک کی گاڑیوں کے لیے۔ معلومات کی تاریخ: ${asOf}۔ قواعد بدل چکے ہیں، اس لیے سرکاری اعلان دیکھتے رہیں۔`
              : `Rs${RELIEF.perLitre} per litre off petrol for motorcycles, rickshaws and cars up to 800cc, registered by SMS to ${RELIEF.shortcode}. As of ${asOf}. Rules have changed since launch, so check the latest official announcement.`}
          </p>
          <p className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm">
            {isUr ? 'خلاصہ (رومن اردو): 9771 par REG bhejein, phir pump se pehle TOK. Message free hai, koi OTP ya paise nahi mangta.' : 'In short (Roman Urdu): 9771 par REG bhejein, phir pump se pehle TOK. Message free hai, koi OTP ya paise nahi mangta.'}
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'کون اہل ہے اور کتنے لیٹر' : 'Who is eligible and how many litres'}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-start">
              <tbody>
                {rows.map(([a, b]) => (
                  <tr key={a} className="border-b border-border">
                    <td className="py-2 pe-4">{a}</td>
                    <td className="py-2 font-semibold">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-fg-muted">
            <li>
              {isUr
                ? 'ٹوکن عموماً 5 لیٹر (موٹر سائیکل، Rs500 رعایت) یا 10 لیٹر (گاڑی، Rs1,000) کے بتائے گئے؛ 19 ستمبر کو حکومت نے ہر ٹوکن پر 5 لیٹر کی کم از کم حد ختم کی۔'
                : 'Tokens were first reported as 5 litres (bikes, Rs500 off) or 10 litres (cars, Rs1,000 off); on 19 Sep the minister said the five-litre limit per token was removed.'}
            </li>
            <li>
              {isUr
                ? 'موٹر سائیکل اور تین پہیوں والی گاڑیوں کے لیے صارفین بھی درخواست دے سکتے ہیں؛ گاڑیوں کے لیے صرف رجسٹرڈ مالک۔'
                : 'For motorcycles and three-wheelers users can apply, not only registered owners; for cars only the registered owner can.'}
            </li>
            <li>{isUr ? 'اہلیت کی مزید شرائط (گاڑی کی عمر، رجسٹریشن کا سال) بدلتی رہی ہیں؛ ہر تبدیلی کا ماخذ نیچے ہے۔' : 'Other limits (vehicle age, registration year) have changed more than once; the sources below carry each change.'}</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'آج کی قیمت اور ریلیف کے بعد' : 'Pump price today and after relief'}</h2>
          {petrol ? (
            <p className="mt-3">
              {isUr
                ? `پیٹرول آج Rs${petrol.value.toLocaleString('en-US')} فی لیٹر ہے؛ Rs${RELIEF.perLitre} ریلیف کے ساتھ تقریباً Rs${netPetrolPrice(petrol.value).toLocaleString('en-US')}۔ یہ صرف مثال ہے۔`
                : `Petrol is Rs${petrol.value.toLocaleString('en-US')} per litre at the pump. With the Rs${RELIEF.perLitre} relief that works out to about Rs${netPetrolPrice(petrol.value).toLocaleString('en-US')} per litre. Illustration only: the discount is applied at the pump on eligible litres.`}
            </p>
          ) : null}
          <p className="mt-2 text-sm">
            <Link href={localePath(locale, '/petrol-price-today-pakistan')} className="font-semibold underline">
              {isUr ? 'آج کا پیٹرول اور ڈیزل ریٹ' : 'Petrol and diesel price today'}
            </Link>
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'REG پیغام بنائیں' : 'Build your REG message'}</h2>
          <div className="mt-3">
            <FuelReliefSmsBuilder isUr={isUr} />
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            {isUr
              ? 'تاریخ کی شکل: وزیر نے صرف "رجسٹریشن کی تاریخ" بتائی؛ ProPakistani DDMMYYYY لکھتا ہے (مثلاً 07032019)، دیگر ویب سائٹس مختلف شکل لکھتی ہیں۔ ہم DDMMYYYY استعمال کرتے ہیں؛ اگر جواب میں غلطی آئے تو 9771 کا ردعمل دیکھیں۔'
              : 'Date format: officials only said "registration date". ProPakistani gives DDMMYYYY (for example 07032019) while other sites show other formats. We use DDMMYYYY; if 9771 replies with an error, follow the format in its reply.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'صوبائی کوڈ' : 'Province codes'}</h2>
          <p className="mt-2 text-sm text-fg-muted">
            {isUr
              ? 'گاڑی جس صوبے میں رجسٹر ہے وہی لکھیں، رہائش کا صوبہ نہیں۔ وزیر کے مطابق صوبے کا پہلا حرف یا پورا نام چلتا ہے۔'
              : 'Use the province where the vehicle is registered, not where you live. The minister said the first letter or the full name of the province works.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PROVINCES.map((p) => (
              <span key={p.code} className="rounded-lg border border-border px-3 py-1 text-sm">
                <strong dir="ltr">{p.code}</strong> {isUr ? p.ur : p.en}
              </span>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'TOK اور پمپ پر' : 'TOK and what to show at the pump'}</h2>
          <ol className="mt-3 list-decimal space-y-1 ps-5">
            {(isUr
              ? [
                  'رجسٹریشن کامیاب ہونے پر تصدیقی پیغام آتا ہے؛ رجسٹریشن ایک بار کی ہے۔',
                  'پمپ جانے سے پہلے 9771 پر TOK بھیجیں۔',
                  'جواب میں ملنے والا ٹوکن نمبر پمپ کے عملے کو دکھائیں۔',
                  'بل دیکھ کر یقینی بنائیں کہ رعایت کٹی ہے۔ پمپ انکار کرے تو 9771 پر، پمپ کی شکایت 9772 پر۔',
                ]
              : [
                  'A confirmation message arrives when registration succeeds; registration is one time.',
                  `Before you go to the pump, send TOK to ${RELIEF.shortcode}.`,
                  'Show the token number you get back to the pump attendant.',
                  `Check the bill carries the discount. Report a pump that refuses the relief to ${RELIEF.shortcode}, and other pump complaints to ${RELIEF.complaintsCode}.`,
                ]
            ).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold">{isUr ? 'دھوکے سے بچیں' : 'Scam warning'}</h2>
          <p className="mt-2">
            {isUr
              ? 'حکومت کے مطابق وہ فون، واٹس ایپ یا ایس ایم ایس پر پیسے، OTP، کوڈ یا اضافی معلومات نہیں مانگتی۔ ایجنٹوں کو فیس نہ دیں، اپنا شناختی کارڈ کسی سے شیئر نہ کریں۔'
              : 'The government says it will not ask for money, an OTP, a code or extra data by phone, WhatsApp or SMS. Do not pay agents and do not share your CNIC with anyone. Only send your details to 9771 yourself.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'کیا ڈیزل شامل ہے؟' : 'Is diesel covered?'}</h2>
          <p className="mt-2">
            {isUr
              ? 'ہمیں ملنے والی رپورٹس میں ریلیف صرف پیٹرول پر ہے۔ جب تک کوئی نوٹیفائیڈ اصول نہ آئے ہم ڈیزل شامل نہیں دکھائیں گے۔'
              : 'Every report we read covers petrol only. We will not show diesel as covered until a notified rule says so, and this page will change when an expansion is announced.'}
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
          <p className="mt-3 text-sm text-fg-muted">{isUr ? 'ہم درخواست نہیں لیتے۔ ہر مرحلہ آپ کے SMS اور 9771 کے درمیان ہوتا ہے۔' : 'Zaviya does not take applications. Every step is between your SMS and 9771.'}</p>
        </section>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
