import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A desk section: the lead story as one big card on the start side, the other stories listed beside it.
 * Nothing changes on scroll (Waleed, 14 Nov: the scroll-driven image swap felt broken); the lead card
 * stays the lead card. Rendered on the server, no client script.
 */
export function ScrollFeature({
  features,
  rows,
  accent,
  tone = 'light',
}: {
  /** One big card per story, same order as `rows`; only the first is shown */
  features: ReactNode[]
  rows: ReactNode[]
  /** Desk colour for the row markers */
  accent: string
  tone?: 'light' | 'dark'
  /** Kept for callers; no counter is shown any more */
  counter?: string
}) {
  const count = Math.min(features.length, rows.length)
  const dark = tone === 'dark'
  if (count === 0) return null

  return (
    <div className="grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="lg:self-start">{features[0]}</div>

      {count > 1 && (
        <ol className={cn('divide-y', dark ? 'divide-ink-line' : 'divide-border')}>
          {rows.slice(1, count).map((r, i) => (
            <li key={i} className="relative ps-4">
              <span className="absolute bottom-3 start-0 top-3 w-[3px] rounded-full" style={{ background: accent }} aria-hidden />
              {r}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
