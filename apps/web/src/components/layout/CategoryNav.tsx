'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CategoryRef, Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'
import { localePath } from '@/lib/i18n'
import { categoryIcon } from '@/lib/category-icons'

export function CategoryNav({
  categories,
  locale,
  variant = 'strip',
}: {
  categories: CategoryRef[]
  locale: Locale
  variant?: 'strip' | 'inline'
}) {
  const pathname = usePathname()
  const normalized = (pathname ?? '/').replace(/^\/(en|ur)(?=\/|$)/, '') || '/'

  return (
    <nav aria-label="Categories" className={cn(variant === 'strip' && 'border-t border-border/70')}>
      <div className={cn('no-scrollbar flex items-center overflow-x-auto', variant === 'strip' ? 'container-wide gap-2 py-2.5' : 'h-12 gap-0.5')}>
        {categories.map((cat) => {
          const href = localePath(locale, `/${cat.slug}`)
          const active = normalized === `/${cat.slug}` || normalized.startsWith(`/${cat.slug}/`)
          const Icon = categoryIcon(cat.slug)
          if (variant === 'strip') {
            return (
              <Link
                key={cat.slug}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn('chip min-h-9', active && 'border-transparent text-white')}
                style={active ? { background: cat.color } : undefined}
              >
                <Icon className="h-3.5 w-3.5" style={active ? undefined : { color: cat.color }} aria-hidden />
                {cat.name}
              </Link>
            )
          }
          return (
            <Link
              key={cat.slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-full shrink-0 items-center gap-2 px-3 text-[15px] font-semibold transition-colors',
                active ? 'text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" style={{ color: cat.color }} aria-hidden />
              {cat.name}
              <span
                className={cn('absolute inset-x-2 bottom-0 h-[3px] rounded-t-sm transition-opacity', active ? 'opacity-100' : 'opacity-0')}
                style={{ background: cat.color }}
                aria-hidden
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
