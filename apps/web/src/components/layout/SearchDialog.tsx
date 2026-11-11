'use client'

import { Search, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { t, localePath } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { QUICK_TOOLS } from '@/components/home/tools'
import { PriceSearch } from '@/components/appliances/PriceSearch'

export interface SearchSuggestion {
  label: string
  href: string
}

export function SearchDialog({
  locale,
  variant = 'icon',
  suggestions = [],
}: {
  locale: Locale
  variant?: 'icon' | 'bar'
  suggestions?: SearchSuggestion[]
}) {
  const d = t(locale)
  const isUr = locale === 'ur'
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const placeholder = isUr ? 'کوئی بھی قیمت تلاش کریں: آٹا، انڈے، ہونڈا 70…' : 'Search any price: atta, eggs, honda 70, fridge…'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'bar' ? (
          <button
            type="button"
            className="flex h-12 w-full items-center gap-3 rounded-2xl border-[1.5px] border-border bg-surface-2 px-4 text-start text-[15px] text-fg-subtle transition-colors hover:border-accent/50"
          >
            <Search className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{placeholder}</span>
            <kbd className="hidden rounded-lg border border-border bg-surface px-2 py-0.5 text-xs font-bold text-fg-subtle lg:inline">⌘K</kbd>
          </button>
        ) : (
          <button
            type="button"
            aria-label={d.openSearch}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-fg hover:border-accent hover:text-accent"
          >
            <Search className="h-5 w-5" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogTitle className="sr-only">{d.search}</DialogTitle>
        <PriceSearch locale={locale} variant="dialog" inline autoFocus newsHref={localePath(locale, '/search')} onNavigate={() => setOpen(false)} onQueryChange={setQ} />
        <div className={cn('space-y-5 p-5', q.trim().length >= 2 && 'hidden')}>
          {suggestions.length > 0 && (
            <div>
              <p className="eyebrow mb-3 text-fg-subtle">{isUr ? 'ٹرینڈنگ' : 'Trending now'}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Link key={s.href} href={s.href} onClick={() => setOpen(false)} className="chip min-h-8 text-[13px]">
                    <TrendingUp className="h-3.5 w-3.5 text-amber" aria-hidden />
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="eyebrow mb-3 text-fg-subtle">{isUr ? 'فوری ٹولز' : 'Quick tools'}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUICK_TOOLS.map((tool) => (
                <Link
                  key={tool.path}
                  href={localePath(locale, tool.path)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5 text-sm font-semibold hover:text-accent"
                >
                  <span className={cn('icon-tile h-8 w-8', tool.tile)}>
                    <tool.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {isUr ? tool.ur : tool.en}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
