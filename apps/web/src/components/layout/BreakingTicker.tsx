'use client'

import Link from 'next/link'
import type { ArticleCard, Locale } from '@zaviya/shared'
import { LiveBadge } from '@/components/article/LiveBadge'
import { t } from '@/lib/i18n'

export function BreakingTicker({ items, locale }: { items: ArticleCard[]; locale: Locale }) {
  if (!items.length) return null
  const d = t(locale)
  const doubled = [...items, ...items]

  return (
    <div className="border-b border-breaking/20 bg-breaking/5">
      <div className="container-page flex h-10 items-center gap-3 overflow-hidden">
        <LiveBadge locale={locale} breaking />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="ticker-scroll flex w-max gap-8 whitespace-nowrap">
            {doubled.map((item, i) => (
              <Link key={`${item.id}-${i}`} href={item.href} className="text-sm font-medium hover:text-accent">
                {item.title}
              </Link>
            ))}
          </div>
        </div>
        <span className="sr-only">{d.breaking}</span>
      </div>
    </div>
  )
}
