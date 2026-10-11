import { House } from 'lucide-react'
import Link from 'next/link'
import type { CategoryRef, Locale } from '@zaviya/shared'
import { Logo } from '@/components/brand/Logo'
import { CategoryNav } from '@/components/layout/CategoryNav'
import { SearchDialog, type SearchSuggestion } from '@/components/layout/SearchDialog'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { localePath } from '@/lib/i18n'

export function SiteHeader({
  locale,
  categories,
  langHref,
  suggestions,
}: {
  locale: Locale
  categories: CategoryRef[]
  langHref: string
  suggestions: SearchSuggestion[]
}) {
  const isUr = locale === 'ur'
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-surface/85">
      <div className="container-wide flex h-16 items-center gap-4 md:h-[76px] md:gap-6">
        <Logo locale={locale} tagline />
        <div className="mx-auto hidden min-w-0 max-w-[620px] flex-1 md:block">
          <SearchDialog locale={locale} variant="bar" suggestions={suggestions} />
        </div>
        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <div className="md:hidden">
            <SearchDialog locale={locale} suggestions={suggestions} />
          </div>
          <ThemeToggle locale={locale} />
          <div className="lg:hidden">
            <MobileMenu locale={locale} categories={categories} langHref={langHref} />
          </div>
        </div>
      </div>
      <div className="hidden border-t border-border/70 lg:block">
        <div className="container-wide flex items-center">
          <Link
            href={localePath(locale, '/')}
            className="flex h-12 shrink-0 items-center gap-2 border-b-[3px] border-transparent px-3 text-[15px] font-semibold text-fg-muted hover:text-accent"
          >
            <House className="h-4 w-4" aria-hidden />
            {isUr ? 'ہوم' : 'Home'}
          </Link>
          <div className="min-w-0 flex-1">
            <CategoryNav categories={categories} locale={locale} variant="inline" />
          </div>
          <Link href={localePath(locale, '/live')} className="flex h-12 shrink-0 items-center gap-2 px-3 text-[15px] font-bold text-breaking">
            <span className="live-dot" aria-hidden />
            {isUr ? 'لائیو' : 'Live'}
          </Link>
        </div>
      </div>
      <div className="lg:hidden">
        <CategoryNav categories={categories} locale={locale} variant="strip" />
      </div>
    </header>
  )
}
