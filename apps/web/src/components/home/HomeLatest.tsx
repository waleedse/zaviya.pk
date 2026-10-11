'use client'

import { useState } from 'react'
import type { ArticleCard, Locale } from '@zaviya/shared'
import { ArticleCard as Card } from '@/components/article/ArticleCard'
import { t } from '@/lib/i18n'

export function HomeLatest({ locale, initial }: { locale: Locale; initial: ArticleCard[] }) {
  const d = t(locale)
  const [count, setCount] = useState(9)
  const visible = initial.slice(0, count)
  if (!visible.length) return null
  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((a) => (
          <Card key={a.id} article={a} locale={locale} variant="medium" />
        ))}
      </div>
      {count < initial.length && (
        <button
          type="button"
          className="mt-6 w-full rounded-2xl border-[1.5px] border-dashed border-border py-3.5 text-sm font-bold text-fg-muted hover:border-accent hover:text-accent"
          onClick={() => setCount((c) => c + 9)}
        >
          {d.loadMore}
        </button>
      )}
    </div>
  )
}
