import { Flame } from 'lucide-react'
import Link from 'next/link'
import type { Locale } from '@zaviya/shared'
import type { SearchSuggestion } from '@/components/layout/SearchDialog'

/** "Trending" row under the header: the site's hottest tags, then evergreen tools people search daily. */
export function TrendingStrip({ locale, items }: { locale: Locale; items: SearchSuggestion[] }) {
  if (!items.length) return null
  return (
    <div className="border-b border-border bg-surface">
      <div className="container-wide no-scrollbar flex items-center gap-2 overflow-x-auto py-2.5">
        <span className="flex shrink-0 items-center gap-1.5 pe-2 text-sm font-extrabold text-amber">
          <Flame className="h-4 w-4 fill-amber-200" aria-hidden />
          {locale === 'ur' ? 'ٹرینڈنگ' : 'Trending'}
        </span>
        {items.map((item, i) => (
          <Link key={item.href} href={item.href} className="chip">
            <span className="font-bold text-fg-subtle">#{i + 1}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
