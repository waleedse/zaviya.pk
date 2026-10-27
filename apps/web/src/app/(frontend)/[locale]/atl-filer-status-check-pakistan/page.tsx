import Link from 'next/link'
import { AtlSmsHelper } from '@/components/data/AtlSmsHelper'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { ATL } from '@/lib/atl-check'

export const revalidate = 86400

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'ایف بی آر ATL: فائلر اسٹیٹس چیک کریں | شناختی کارڈ سے' : 'FBR ATL Check: Am I a Filer? Active Taxpayer List Status by CNIC',
    description:
      locale === 'ur'
        ? 'ایکٹو ٹیکس پیئر لسٹ (ATL) میں اپنا نام چیک کرنے کے تین سرکاری طریقے: ایف بی آر پورٹل، 9966 پر ایس ایم ایس، اور لسٹ ڈاؤن لوڈ۔'
        : 'Check whether you are on the FBR Active Taxpayer List (ATL): the official portal, an SMS to 9966, or the downloadable list. Build the SMS text here; your CNIC never leaves your browser.',
    enPath: '/atl-filer-status-check-pakistan',
    urPath: '/ur/atl-filer-status-check-pakistan',
    absoluteTitle: true,
  })
}

export default async function AtlPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'

  const faqs = isUr
    ? [
        { q: 'ATL میں اپنا نام کیسے چیک کریں؟', a: `تین طریقے ہیں: ایف بی آر کا آن لائن ATL پورٹل، ${ATL.smsShortcode} پر ATL کے بعد خالی جگہ اور 13 ہندسوں کا شناختی کارڈ نمبر بھیجنا، یا ATL فائل ڈاؤن لوڈ کر کے اس میں تلاش کرنا۔` },
        { q: 'ATL kya hai aur filer status kaise check karein?', a: `ATL Active Taxpayer List hai. Apna CNIC (13 digits) likh kar "ATL <CNIC>" ka SMS ${ATL.smsShortcode} par bhejein, ya FBR ka portal use karein.` },
        { q: 'کمپنی یا AOP اپنا اسٹیٹس کیسے دیکھے؟', a: `ATL کے بعد خالی جگہ اور 7 ہندسوں کا این ٹی این لکھ کر ${ATL.smsShortcode} پر بھیجیں۔` },
        { q: 'آزاد کشمیر کے رہائشی کیا کریں؟', a: `ایف بی آر کے مطابق AJKATL کے بعد خالی جگہ اور بغیر ڈیش کے شناختی کارڈ نمبر لکھ کر ${ATL.smsShortcode} پر بھیجیں۔` },
        { q: 'کیا زاویہ میرا شناختی کارڈ نمبر محفوظ کرتا ہے؟', a: 'نہیں۔ اس صفحے کا ٹول ایس ایم ایس کا متن آپ کے براؤزر میں بناتا ہے، نمبر ہمارے سرور تک نہیں جاتا۔ اسٹیٹس ایف بی آر ہی بتاتا ہے۔' },
      ]
    : [
        { q: 'How do I check if I am on the Active Taxpayer List (ATL)?', a: `FBR lists three ways: the online ATL status page, an SMS to ${ATL.smsShortcode} in the form "ATL" + space + your 13-digit CNIC, or downloading the ATL and searching it.` },
        { q: 'ATL kya hai aur filer status kaise check karein?', a: `ATL ka matlab Active Taxpayer List hai. "ATL <13-digit CNIC>" ka SMS ${ATL.smsShortcode} par bhejein ya FBR ka portal use karein.` },
        { q: 'How can a company or AOP check its status?', a: `Send "ATL" + space + the 7-digit NTN to ${ATL.smsShortcode}.` },
        { q: 'What should residents of AJK send?', a: `FBR gives a separate keyword: "AJKATL" + space + CNIC without dashes (or the 11-digit NTN), sent to ${ATL.smsShortcode}.` },
        { q: 'Does Zaviya store my CNIC?', a: 'No. The tool on this page only builds the SMS text inside your browser; the number is not sent to Zaviya. The status itself comes from FBR.' },
      ]

  const ways = isUr
    ? [
        { t: '1. آن لائن پورٹل', d: 'ایف بی آر کے ATL اسٹیٹس پیج پر اپنی تفصیل درج کریں۔', href: ATL.portalUrl, l: 'ایف بی آر ATL پورٹل' },
        { t: `2. ایس ایم ایس ${ATL.smsShortcode}`, d: 'افراد: ATL، خالی جگہ، 13 ہندسوں کا شناختی کارڈ۔ کمپنی/AOP: ATL، خالی جگہ، 7 ہندسوں کا این ٹی این۔', href: ATL.fbrPageUrl, l: 'ایف بی آر ہدایات' },
        { t: '3. لسٹ ڈاؤن لوڈ', d: 'مکمل ATL ڈاؤن لوڈ کر کے اپنا نام یا نمبر تلاش کریں۔', href: ATL.listUrl, l: 'ATL ڈاؤن لوڈ' },
      ]
    : [
        { t: '1. Online portal', d: 'Enter your details on FBR’s ATL status page.', href: ATL.portalUrl, l: 'FBR ATL portal' },
        { t: `2. SMS to ${ATL.smsShortcode}`, d: 'Individuals: ATL, a space, then the 13-digit CNIC. Companies and AOPs: ATL, a space, then the 7-digit NTN.', href: ATL.fbrPageUrl, l: 'FBR instructions' },
        { t: '3. Download the list', d: 'Download the full ATL and search for your name or number.', href: ATL.listUrl, l: 'Download ATL' },
      ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: isUr ? 'ہوم' : 'Home', url: localePath(locale, '/') },
            { name: isUr ? 'ATL فائلر اسٹیٹس' : 'ATL filer status', url: localePath(locale, '/atl-filer-status-check-pakistan') },
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
            › {isUr ? 'ATL فائلر اسٹیٹس' : 'ATL filer status'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'ایف بی آر ATL: کیا آپ فائلر ہیں؟' : 'FBR ATL check: are you on the Active Taxpayer List?'}
          </h1>
          <p className="max-w-[720px] text-fg-muted">
            {isUr
              ? 'ایکٹو ٹیکس پیئر لسٹ (ATL) ایف بی آر کی فہرست ہے جس میں فائلر کے طور پر درج لوگ اور کمپنیاں شامل ہیں۔ اسٹیٹس صرف ایف بی آر بتا سکتا ہے۔ یہ صفحہ آپ کو سرکاری راستے اور ایس ایم ایس کا درست متن دیتا ہے۔'
              : 'The Active Taxpayer List (ATL) is FBR’s list of people and companies recorded as filers. Only FBR can confirm your status. This page points you to the official routes and builds the exact SMS text.'}
          </p>
          <p className="max-w-[720px] rounded-xl bg-accent-soft p-3 text-sm">
            {isUr
              ? 'خلاصہ (رومن اردو): ATL check karne ke liye "ATL <CNIC>" ka SMS 9966 par bhejein, ya FBR portal kholein.'
              : 'In short (Roman Urdu): ATL check karne ke liye "ATL <CNIC>" ka SMS 9966 par bhejein, ya FBR portal kholein.'}
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'ایس ایم ایس کا متن بنائیں' : 'Build your SMS'}</h2>
          <div className="mt-3">
            <AtlSmsHelper isUr={isUr} />
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold">{isUr ? 'اسٹیٹس چیک کرنے کے تین سرکاری طریقے' : 'Three official ways to check'}</h2>
          <ul className="mt-3 space-y-3">
            {ways.map((w) => (
              <li key={w.t} className="rounded-2xl border border-border p-4">
                <p className="font-semibold">{w.t}</p>
                <p className="mt-1 text-fg-muted">{w.d}</p>
                <a href={w.href} rel="noopener nofollow" className="mt-1 inline-block underline">
                  {w.l}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-fg-muted">
            {isUr ? `آزاد کشمیر: AJKATL، خالی جگہ، بغیر ڈیش شناختی کارڈ، ${ATL.smsShortcode} پر۔` : `Azad Jammu and Kashmir: AJKATL, a space, CNIC without dashes, to ${ATL.smsShortcode}.`}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-xl font-bold">{isUr ? 'اگر آپ لسٹ میں نہیں ہیں' : 'If you are not on the list'}</h2>
          <p className="mt-2 text-fg-muted">
            {isUr
              ? 'فائلر بننے کے لیے ایف بی آر کے IRIS پورٹل پر رجسٹریشن اور ریٹرن جمع کرانا ہوتا ہے۔ ہم ٹیکس مشورہ نہیں دیتے؛ شرحیں اور شرائط ایف بی آر یا ٹیکس ماہر سے تصدیق کریں۔'
              : 'Becoming a filer means registering on FBR’s IRIS portal and filing a return. Zaviya does not give tax advice; confirm rates and conditions with FBR or a tax adviser.'}
          </p>
          <p className="mt-2">
            <Link href={localePath(locale, '/income-tax-return-deadline-pakistan')} className="underline">
              {isUr ? 'انکم ٹیکس ریٹرن کی آخری تاریخ' : 'Income tax return deadline'}
            </Link>
          </p>
        </section>

        <p className="text-sm text-fg-muted">
          {isUr ? 'آخری جانچ' : 'Last checked'}: {ATL.asOf}. {isUr ? 'ماخذ' : 'Source'}:{' '}
          <a href={ATL.fbrPageUrl} rel="noopener nofollow" className="underline">
            FBR
          </a>
          .
        </p>
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
