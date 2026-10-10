import { LOCALES, RTL_LOCALES, SITE, type Locale } from '@zaviya/shared'
import { Inter, Newsreader, Gulzar, Noto_Nastaliq_Urdu } from 'next/font/google'
import { notFound } from 'next/navigation'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { FrontendShell, defaultLangHref } from '@/components/layout/FrontendShell'
import { getBreaking, getCategories, getRatesTicker } from '@/lib/queries'
import { JsonLd } from '@/components/seo/JsonLd'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo'
import '../styles.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap' })
const gulzar = Gulzar({ weight: '400', subsets: ['arabic'], variable: '--font-gulzar', display: 'swap' })
const nastaliq = Noto_Nastaliq_Urdu({ weight: ['400', '600'], subsets: ['arabic'], variable: '--font-nastaliq', display: 'swap' })

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

  const [categories, rates, breaking] = await Promise.all([
    getCategories(locale),
    getRatesTicker(),
    getBreaking(locale),
  ])

  const langHref = defaultLangHref(locale)

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${inter.variable} ${newsreader.variable} ${locale === 'ur' ? `${gulzar.variable} ${nastaliq.variable}` : ''}`}>
      <body className="min-h-screen pb-16 md:pb-0">
        <ThemeProvider>
          <JsonLd data={[organizationJsonLd(), websiteJsonLd(locale)]} />
          <FrontendShell locale={locale} categories={categories} rates={rates} breaking={breaking} langHref={langHref}>
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
  const title = locale === 'ur' ? `${SITE.nameUr} — ${SITE.taglineUr}` : `${SITE.name} — ${SITE.tagline}`
  return {
    title: { default: title, template: `%s | ${locale === 'ur' ? SITE.nameUr : SITE.name}` },
    description: SITE.tagline,
  }
}
