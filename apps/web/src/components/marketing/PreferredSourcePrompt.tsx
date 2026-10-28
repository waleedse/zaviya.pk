'use client'

import type { Locale } from '@zaviya/shared'
import { trackShare } from '@/components/article/ShareBar'
import { PREFERRED_SOURCE_COPY, PREFERRED_SOURCE_URL } from '@/lib/preferred-source'
import { cn } from '@/lib/utils'

/**
 * "Add Zaviya as a preferred source on Google" (ZAV-241). A plain anchor, so it works without JS; the click is
 * counted first-party as preferred_source_click. No images or async content: the block has its final height at first paint.
 */
export function PreferredSourcePrompt({ locale, variant = 'card' }: { locale: Locale; variant?: 'card' | 'footer' }) {
  const c = PREFERRED_SOURCE_COPY[locale]
  const footer = variant === 'footer'
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2',
        footer ? 'text-sm text-slate-400' : 'rounded-[22px] border border-border bg-surface p-4',
      )}
    >
      <div className="min-w-0 flex-1 basis-60">
        <p className={cn('text-sm font-bold', footer && 'text-slate-200')}>{c.title}</p>
        <p className={cn('mt-0.5 text-xs', footer ? 'text-slate-500' : 'text-fg-subtle')} dir="ltr">
          {c.roman}
        </p>
      </div>
      <a
        href={PREFERRED_SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackShare('preferred_source', window.location.pathname)}
        className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white hover:brightness-95"
      >
        {c.cta}
      </a>
    </div>
  )
}
