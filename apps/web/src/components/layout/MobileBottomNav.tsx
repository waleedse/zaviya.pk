'use client'

import { Home, Radio, LineChart, Search, Bookmark } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Locale } from '@zaviya/shared'
import { localePath, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function MobileBottomNav({ locale }: { locale: Locale }) {
  const d = t(locale)
  const pathname = usePathname()
  const items = [
    { href: localePath(locale, '/'), label: d.nav.home, icon: Home },
    { href: localePath(locale, '/live'), label: d.nav.live, icon: Radio },
    { href: localePath(locale, '/gold-rate-today-pakistan'), label: d.nav.rates, icon: LineChart },
    { href: localePath(locale, '/search'), label: d.nav.search, icon: Search },
    { href: '#saved', label: d.nav.saved, icon: Bookmark },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden" aria-label="Mobile">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== localePath(locale, '/') && pathname?.startsWith(href))
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
                  active ? 'text-accent' : 'text-fg-muted',
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
