import { LOCALES, RTL_LOCALES, SITE, type Locale } from '@zaviya/shared'
import { Bricolage_Grotesque, Hanken_Grotesk, Newsreader, Gulzar, Noto_Nastaliq_Urdu } from 'next/font/google'
import { notFound } from 'next/navigation'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { FrontendShell, defaultLangHref } from '@/components/layout/FrontendShell'
import { getBreaking, getCategories, getHomeFeed, getRatesTicker, getTrendingTags } from '@/lib/queries'
import { JsonLd } from '@/components/seo/JsonLd'
import { AnalyticsScripts } from '@/components/analytics/AnalyticsScripts'
import Script from 'next/script'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo'
import '../styles.css'

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' })
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap' })
const gulzar = Gulzar({ weight: '400', subsets: ['arabic'], variable: '--font-gulzar', display: 'swap' })
// English pages show Urdu name spellings too; preload is off so English readers only fetch it when Urdu text appears.
const nastaliq = Noto_Nastaliq_Urdu({ weight: ['400', '600'], subsets: ['arabic'], variable: '--font-nastaliq', display: 'swap', preload: false })

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!LOCALES.includes(raw as Locale)) notFound()
  const locale = raw as Locale
  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr'

  const [categories, rates, breaking, trendingTags] = await Promise.all([
    getCategories(locale),
    getRatesTicker(locale),
    getBreaking(locale),
    getTrendingTags(locale, 8),
  ])

  // No story flagged breaking: the ticker carries the newest headlines instead, so it is never empty
  const ticker = breaking.length ? breaking : (await getHomeFeed(locale)).latest.slice(0, 6)
  const langHref = defaultLangHref(locale)

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${bricolage.variable} ${hanken.variable} ${newsreader.variable} ${nastaliq.variable} ${locale === 'ur' ? gulzar.variable : ''}`}>
      <body className="min-h-screen pb-16 md:pb-0">
        <AnalyticsScripts />
        {process.env.NEXT_PUBLIC_ADSENSE_CLIENT ? (
          <Script
            id="adsense-global"
            strategy="lazyOnload"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT}`}
          />
        ) : null}
        <ThemeProvider>
          <JsonLd data={[organizationJsonLd(), websiteJsonLd(locale)]} />
          <FrontendShell locale={locale} categories={categories} rates={rates} breaking={ticker} tickerLabel={breaking.length ? undefined : 'latest'} langHref={langHref} trendingTags={trendingTags}>
            {children}
          </FrontendShell>
        </ThemeProvider>
      </body>
    </html>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  const locale = raw as Locale
  const title = locale === 'ur' ? `${SITE.nameUr} — ${SITE.taglineUr}` : `${SITE.brandName} — ${SITE.tagline}`
  return {
    title: { default: title, template: `%s | ${locale === 'ur' ? SITE.nameUr : SITE.brandName}` },
    description: SITE.tagline,
  }
}
