'use client'

import { Home, Radio, LineChart, MoonStar, Languages } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Locale } from '@zaviya/shared'
import { localePath, t, urduEnabled } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function MobileBottomNav({ locale, langHref }: { locale: Locale; langHref: string }) {
  const d = t(locale)
  const pathname = usePathname()
  const items = [
    { href: localePath(locale, '/'), label: d.nav.home, icon: Home },
    { href: localePath(locale, '/live'), label: d.nav.live, icon: Radio },
    { href: localePath(locale, '/gold-rate-today-pakistan'), label: d.nav.rates, icon: LineChart },
    { href: localePath(locale, '/namaz-timings'), label: locale === 'ur' ? 'نماز' : 'Namaz', icon: MoonStar },
    ...(urduEnabled() ? [{ href: langHref, label: locale === 'ur' ? 'English' : 'اردو', icon: Languages }] : []),
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Mobile">
      <ul className={cn('grid', items.length === 5 ? 'grid-cols-5' : 'grid-cols-4')}>
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== localePath(locale, '/') && pathname?.startsWith(href))
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'mx-1 my-1 flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-bold',
                  active ? 'bg-accent-soft text-accent' : 'text-fg-muted',
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
