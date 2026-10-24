import Link from 'next/link'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'
import { siteUrl } from '@/lib/seo'
import { embedSnippet, type EmbedType } from '@/lib/embed-rates'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'مفت ریٹ ویجٹ: سونا، ڈالر، پیٹرول' : 'Free Pakistan Rates Widget: Gold, Dollar, Petrol',
    description:
      locale === 'ur'
        ? 'اپنی ویب سائٹ پر سونے، ڈالر اور پیٹرول کے لائیو ریٹ مفت لگائیں۔ ایک iframe اور ایک لنک کاپی کریں۔'
        : 'Add live gold, dollar and petrol rates for Pakistan to your website for free. Copy one iframe and one link. No ads, no cookies.',
    enPath: '/widgets',
    urPath: '/ur/widgets',
    absoluteTitle: true,
  })
}

const OPTIONS: { type: EmbedType; en: string; ur: string }[] = [
  { type: 'all', en: 'All rates (gold, dollar, petrol)', ur: 'تمام ریٹ (سونا، ڈالر، پیٹرول)' },
  { type: 'gold', en: 'Gold rate', ur: 'سونے کا ریٹ' },
  { type: 'dollar', en: 'Dollar rate', ur: 'ڈالر کا ریٹ' },
  { type: 'petrol', en: 'Petrol price', ur: 'پیٹرول کی قیمت' },
]

export default async function WidgetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const origin = siteUrl()
  return (
    <div className="pb-10">
      <section className="border-b border-border bg-surface py-8 md:py-12">
        <div className="container-wide flex flex-col gap-3">
          <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
            <Link href={localePath(locale, '/')} className="hover:underline">
              {isUr ? 'ہوم' : 'Home'}
            </Link>{' '}
            › {isUr ? 'ویجٹس' : 'Widgets'}
          </nav>
          <h1 className="font-display text-[clamp(1.9rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">
            {isUr ? 'اپنی ویب سائٹ کے لیے مفت ریٹ ویجٹ' : 'Free rates widget for your website'}
          </h1>
          <p className="max-w-[720px] text-lg text-fg-muted">
            {isUr
              ? 'سونے، ڈالر اور پیٹرول کے لائیو ریٹ اپنی سائٹ پر دکھائیں۔ کوئی اشتہار نہیں، کوئی کوکی نہیں، اور ریٹ خود بخود اپ ڈیٹ ہوتے ہیں۔'
              : 'Show live gold, dollar and petrol rates for Pakistan on your site. No ads, no cookies, and the rates update by themselves. Copy the code below and paste it into your page.'}
          </p>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[860px] space-y-10">
        {OPTIONS.map((o) => {
          const snippet = embedSnippet(o.type, 'light', origin)
          return (
            <section key={o.type} id={o.type} className="space-y-3">
              <h2 className="font-display text-xl font-bold">{isUr ? o.ur : o.en}</h2>
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <iframe
                  src={`/embed/rates?type=${o.type}&theme=light`}
                  width={320}
                  height={o.type === 'all' ? 230 : o.type === 'dollar' ? 160 : 120}
                  className="max-w-full rounded-lg border border-border"
                  loading="lazy"
                  title={isUr ? o.ur : o.en}
                />
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface p-3 text-xs" dir="ltr">
                  <code>{snippet}</code>
                </pre>
              </div>
              <p className="text-sm text-fg-muted">
                {isUr
                  ? 'سنیپٹ میں آئی فریم کے ساتھ ایک سادہ لنک بھی ہے۔ براہ کرم دونوں رکھیں۔'
                  : 'The snippet has the iframe plus a plain text link. Please keep both. For a dark background add theme=dark to the iframe address.'}
              </p>
            </section>
          )
        })}
      </div>
    </div>
  )
}
