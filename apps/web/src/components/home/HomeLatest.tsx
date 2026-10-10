'use client'

import { useState } from 'react'
import type { ArticleCard, Locale } from '@zaviya/shared'
import { ArticleCard as Card } from '@/components/article/ArticleCard'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

export function HomeLatest({ locale, initial }: { locale: Locale; initial: ArticleCard[] }) {
  const d = t(locale)
  const [count, setCount] = useState(8)
  const visible = initial.slice(0, count)
  return (
    <section>
      <div className="divide-y divide-border">
        {visible.map((a) => (
          <Card key={a.id} article={a} locale={locale} variant="list" />
        ))}
      </div>
      {count < initial.length && (
        <Button variant="outline" className="mt-6 w-full" onClick={() => setCount((c) => c + 8)}>
          {d.loadMore}
        </Button>
      )}
    </section>
  )
}
