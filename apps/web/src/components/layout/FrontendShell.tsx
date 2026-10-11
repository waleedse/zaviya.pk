import type { CategoryRef, Locale } from '@zaviya/shared'
import { BreakingTicker } from '@/components/layout/BreakingTicker'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { RatesStripMobile, TopBar } from '@/components/layout/TopBar'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { TrendingStrip } from '@/components/layout/TrendingStrip'
import type { SearchSuggestion } from '@/components/layout/SearchDialog'
import { TOOLS } from '@/components/home/tools'
import type { ArticleCard, RateTick } from '@zaviya/shared'
import { localePath, t } from '@/lib/i18n'
import { PageviewBeacon } from '@/components/analytics/PageviewBeacon'

export function FrontendShell({
  locale,
  categories,
  rates,
  breaking,
  langHref,
  trendingTags = [],
  children,
}: {
  locale: Locale
  categories: CategoryRef[]
  rates: RateTick[]
  breaking: ArticleCard[]
  langHref: string
  trendingTags?: { slug: string; name: string }[]
  children: React.ReactNode
}) {
  const d = t(locale)
  const isUr = locale === 'ur'
  // Tags the newsroom is writing about most, then the tools people look up every day.
  const evergreen = ['/gold-rate-today-pakistan', '/namaz-timings', '/dollar-rate-today-pakistan', '/baby-names', '/petrol-price-today-pakistan']
    .map((path) => TOOLS.find((tool) => tool.path === path)!)
    .map((tool) => ({ label: isUr ? tool.ur : tool.en, href: localePath(locale, tool.path) }))
  const trending: SearchSuggestion[] = [
    ...trendingTags.slice(0, 7).map((tag) => ({ label: tag.name, href: localePath(locale, `/tag/${tag.slug}`) })),
    ...evergreen,
  ]
  return (
    <>
      <PageviewBeacon locale={locale} />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">
        {d.skipToContent}
      </a>
      <TopBar locale={locale} rates={rates} langHref={langHref} />
      <RatesStripMobile locale={locale} rates={rates} />
      <SiteHeader locale={locale} categories={categories} langHref={langHref} suggestions={trending} />
      <TrendingStrip locale={locale} items={trending} />
      <BreakingTicker items={breaking} locale={locale} />
      <main id="main-content" className="min-h-[50vh]">
        {children}
      </main>
      <SiteFooter locale={locale} />
      <MobileBottomNav locale={locale} langHref={langHref} />
    </>
  )
}

export function defaultLangHref(locale: Locale, pathname?: string): string {
  if (locale === 'en') return localePath('ur', pathname ?? '/')
  return localePath('en', pathname?.replace(/^\/ur/, '') ?? '/')
}
