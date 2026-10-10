import type { CategoryRef, Locale } from '@zaviya/shared'
import { BreakingTicker } from '@/components/layout/BreakingTicker'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { RatesStripMobile, TopBar } from '@/components/layout/TopBar'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import type { ArticleCard, RateTick } from '@zaviya/shared'
import { localePath, t } from '@/lib/i18n'

export function FrontendShell({
  locale,
  categories,
  rates,
  breaking,
  langHref,
  children,
}: {
  locale: Locale
  categories: CategoryRef[]
  rates: RateTick[]
  breaking: ArticleCard[]
  langHref: string
  children: React.ReactNode
}) {
  const d = t(locale)
  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg">
        {d.skipToContent}
      </a>
      <TopBar locale={locale} rates={rates} langHref={langHref} />
      <RatesStripMobile locale={locale} rates={rates} />
      <SiteHeader locale={locale} categories={categories} langHref={langHref} />
      <BreakingTicker items={breaking} locale={locale} />
      <main id="main-content" className="min-h-[50vh]">
        {children}
      </main>
      <SiteFooter locale={locale} />
      <MobileBottomNav locale={locale} />
    </>
  )
}

export function defaultLangHref(locale: Locale, pathname?: string): string {
  if (locale === 'en') return localePath('ur', pathname ?? '/')
  return localePath('en', pathname?.replace(/^\/ur/, '') ?? '/')
}
