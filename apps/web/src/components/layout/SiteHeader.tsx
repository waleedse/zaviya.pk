import { Bell, Menu } from 'lucide-react'
import type { CategoryRef, Locale } from '@zaviya/shared'
import { Logo } from '@/components/brand/Logo'
import { CategoryNav } from '@/components/layout/CategoryNav'
import { SearchDialog } from '@/components/layout/SearchDialog'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

export function SiteHeader({ locale, categories, langHref }: { locale: Locale; categories: CategoryRef[]; langHref: string }) {
  const d = t(locale)
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="container-page flex h-14 items-center justify-between gap-4 md:h-16">
        <Logo locale={locale} />
        <div className="hidden items-center gap-1 md:flex">
          <SearchDialog locale={locale} />
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <LanguageSwitch locale={locale} href={langHref} className="hidden xs:inline-flex sm:inline-flex" />
          <ThemeToggle locale={locale} />
          <SearchDialog locale={locale} />
          <Button variant="ghost" size="icon" aria-label={d.openMenu}>
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <CategoryNav categories={categories} locale={locale} />
    </header>
  )
}
