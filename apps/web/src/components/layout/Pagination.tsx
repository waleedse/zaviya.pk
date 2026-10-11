import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function Pagination({
  locale,
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  locale: Locale
  page: number
  totalPages: number
  basePath: string
  searchParams?: Record<string, string>
}) {
  const d = t(locale)
  if (totalPages <= 1) return null

  const link = (p: number) => {
    const params = new URLSearchParams(searchParams)
    if (p > 1) params.set('page', String(p))
    else params.delete('page')
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-4" aria-label="Pagination">
      {page > 1 ? (
        <Link href={link(page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:border-accent hover:text-accent">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          {d.page} {page - 1}
        </Link>
      ) : (
        <span className="inline-flex min-h-11 items-center gap-1 px-4 text-sm text-fg-muted opacity-50">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </span>
      )}
      <span className="text-sm text-fg-muted">
        {d.page} {page} {d.of} {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={link(page + 1)} className={cn('inline-flex min-h-11 items-center gap-1 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:border-accent hover:text-accent')}>
          {d.page} {page + 1}
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      ) : null}
    </nav>
  )
}
