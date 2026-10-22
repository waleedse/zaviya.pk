'use client'

import Link from 'next/link'
import type { ArticleCard, Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'

export function BreakingTicker({ items, locale, label }: { items: ArticleCard[]; locale: Locale; label?: 'latest' }) {
  if (!items.length) return null
  const d = t(locale)
  const doubled = [...items, ...items]

  return (
    <div className="border-b border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/40">
      <div className="container-wide flex h-12 items-center gap-4 overflow-hidden">
        <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-breaking px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white rtl:tracking-normal">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          {label === 'latest' ? d.latest : d.breaking}
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="ticker-scroll flex w-max gap-10 whitespace-nowrap" style={{ animationDuration: `${Math.max(90, items.length * 7)}s` }}>
            {doubled.map((item, i) => (
              <Link
                key={`${item.id}-${i}`}
                href={item.href}
                className="flex items-center gap-10 text-[15px] font-semibold text-red-950 hover:text-breaking dark:text-red-100"
                tabIndex={i >= items.length ? -1 : undefined}
                aria-hidden={i >= items.length ? true : undefined}
              >
                {item.title}
                <span className="text-red-300" aria-hidden>
                  ●
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
