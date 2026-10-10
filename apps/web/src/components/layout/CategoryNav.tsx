'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CategoryRef, Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'
import { localePath } from '@/lib/i18n'

export function CategoryNav({ categories, locale }: { categories: CategoryRef[]; locale: Locale }) {
  const pathname = usePathname()
  const normalized = pathname?.replace(/^\/(en|ur)/, '') || '/'

  return (
    <nav className="border-b border-border" aria-label="Categories">
      <div className="container-page flex h-12 items-center gap-1 overflow-x-auto md:h-14 md:gap-2">
        {categories.map((cat) => {
          const href = localePath(locale, `/${cat.slug}`)
          const active = normalized === `/${cat.slug}` || normalized.startsWith(`/${cat.slug}/`)
          return (
            <Link
              key={cat.slug}
              href={href}
              className={cn(
                'shrink-0 rounded-[var(--radius-pill)] px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-accent',
              )}
              style={active ? { boxShadow: `inset 0 3px 0 0 ${cat.color}` } : undefined}
            >
              {cat.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
