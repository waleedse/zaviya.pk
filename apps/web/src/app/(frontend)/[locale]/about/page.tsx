import { Newspaper } from 'lucide-react'
import { PreferredSourcePrompt } from '@/components/marketing/PreferredSourcePrompt'
import { PageHero } from '@/components/layout/PageHero'
import { JsonLd } from '@/components/seo/JsonLd'
import { localePath, t } from '@/lib/i18n'
import { parseLocale } from '@/lib/locale'
import { aboutPageJsonLd, buildPageMetadata, socialProfileUrls } from '@/lib/seo'

export const revalidate = 3600

// Render on first request, then serve from the ISR cache
export async function generateStaticParams() {
  return []
}

const PROFILE_NAMES: [RegExp, string][] = [
  [/(^|\.)(x|twitter)\.com$/, 'X'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
]

function profileName(url: string): string {
  const host = new URL(url).hostname
  return PROFILE_NAMES.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, '')
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'زاویہ نیوز کے بارے میں | zaviya.pk' : 'About Zaviya News | zaviya.pk',
    description:
      locale === 'ur'
        ? 'زاویہ نیوز (zaviya.pk) پاکستان کی خبریں اردو اور انگریزی میں پیش کرتا ہے۔ ہمارا نیوز روم، ہماری پالیسیاں اور رابطہ۔'
        : 'Zaviya News (zaviya.pk) publishes Pakistan news in English and Urdu. Who we are, how our newsroom works, and how to reach us.',
    enPath: '/about',
    urPath: '/ur/about',
    absoluteTitle: true,
  })
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const isUr = locale === 'ur'
  const d = t(locale)
  const profiles = socialProfileUrls()

  return (
    <div className="pb-10">
      <JsonLd data={aboutPageJsonLd(locale)} />
      <PageHero
        title={isUr ? 'زاویہ نیوز (zaviya.pk)' : 'Zaviya News (zaviya.pk)'}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: isUr ? 'ہمارے بارے میں' : 'About us' }]}
        icon={Newspaper}
        eyebrow={isUr ? 'زاویہ' : 'Zaviya'}
      />
      <div className="container-wide pt-8">
        <div className="card-surface mx-auto max-w-3xl p-6 md:p-10">
          <div className="prose-article" dir={isUr ? 'rtl' : 'ltr'}>
            {isUr ? (
              <>
                <p>زاویہ نیوز، جو zaviya.pk پر شائع ہوتا ہے، پاکستان کا ڈیجیٹل نیوز روم ہے۔ ہم پاکستان کی اہم خبریں، کاروبار، کرکٹ، ٹیکنالوجی، ملازمتیں اور سونے، ڈالر اور پیٹرول کے روزانہ ریٹ آسان زبان میں اردو اور انگریزی دونوں میں پیش کرتے ہیں۔</p>
                <h2>ہمارا نیوز روم کیسے کام کرتا ہے</h2>
                <p>ہم معتبر ذرائع سے خبریں اکٹھی کرتے ہیں، ہر خبر میں ذرائع کا حوالہ دیتے ہیں اور اشاعت سے پہلے حقائق کی جانچ کرتے ہیں۔ مصنوعی ذہانت مسودے میں مدد دیتی ہے، مگر حساس موضوعات پر انسانی ایڈیٹر کی نگرانی ضروری ہے۔ ہماری <a href={localePath(locale, '/p/editorial-policy')}>ادارتی پالیسی</a> اور <a href={localePath(locale, '/p/corrections')}>تصحیحات کی پالیسی</a> پڑھیں۔</p>
                <h2>رابطہ</h2>
                <p>عمومی رابطے کے لیے <a href="mailto:contact@zaviya.pk">contact@zaviya.pk</a> اور غلطی کی نشاندہی کے لیے <a href="mailto:corrections@zaviya.pk">corrections@zaviya.pk</a> پر لکھیں۔</p>
              </>
            ) : (
              <>
                <p>Zaviya News, published at zaviya.pk, is a Pakistani digital newsroom. We cover the stories that matter to Pakistan: national news, business, cricket, technology, jobs, and the daily gold, dollar and petrol rates, in clear English and Urdu.</p>
                <h2>How our newsroom works</h2>
                <p>We gather news from trusted sources, cite them in every story and check the facts before publishing. AI helps with drafting, but sensitive stories always get a human editor. Read our <a href={localePath(locale, '/p/editorial-policy')}>editorial policy</a> and <a href={localePath(locale, '/p/corrections')}>corrections policy</a>.</p>
                <h2>Contact us</h2>
                <p>Write to <a href="mailto:contact@zaviya.pk">contact@zaviya.pk</a> for general enquiries, or <a href="mailto:corrections@zaviya.pk">corrections@zaviya.pk</a> to report a mistake.</p>
              </>
            )}
            {profiles.length ? (
              <>
                <h2>{isUr ? 'ہمیں فالو کریں' : 'Follow Zaviya News'}</h2>
                <ul>
                  {profiles.map((u) => (
                    <li key={u}>
                      <a href={u} rel="me noopener">
                        {profileName(u)}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
          <div className="mt-8">
            <PreferredSourcePrompt locale={locale} />
          </div>
        </div>
      </div>
    </div>
  )
}
