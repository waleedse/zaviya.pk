import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const SIZES = {
  leaderboard: { h: 90, minH: 'min-h-[90px]' },
  rectangle: { h: 250, minH: 'min-h-[250px]' },
  skyscraper: { h: 600, minH: 'min-h-[600px]' },
  native: { h: 120, minH: 'min-h-[120px]' },
} as const

export function AdSlot({
  locale,
  size = 'rectangle',
  className,
}: {
  locale: Locale
  size?: keyof typeof SIZES
  className?: string
}) {
  const d = t(locale)
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT
  const spec = SIZES[size]

  return (
    <aside className={cn('my-8 flex flex-col items-center', className)} aria-label={d.advertisement}>
      <span className="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">{d.advertisement}</span>
      <div
        className={cn('flex w-full max-w-[728px] items-center justify-center rounded-md border border-dashed border-border bg-surface-2/50', spec.minH)}
        style={{ minHeight: spec.h }}
      >
        {client ? (
          <div className="text-xs text-fg-muted">Ad slot ({size})</div>
        ) : (
          <div className="px-4 text-center text-xs text-fg-muted">728×{spec.h}</div>
        )}
      </div>
    </aside>
  )
}
