import Link from 'next/link'
import type { Locale, RateTick } from '@zaviya/shared'
import { Sparkline } from '@/components/data/Sparkline'
import { formatChange, formatNumber } from '@/lib/format'

export function RateCard({ rate, locale }: { rate: RateTick; locale: Locale }) {
  const ch = formatChange(rate.change, rate.changePct, locale)
  const href = locale === 'ur' ? `/ur${rate.href}` : rate.href
  return (
    <Link href={href} className="group block h-full rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-accent/50">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{rate.label}</p>
      <p dir="ltr" className="mt-2 font-display text-[1.7rem] font-bold leading-none tabular-nums">
        {formatNumber(rate.value)}
        <span className="ms-1 font-sans text-xs font-medium text-fg-subtle">{rate.unit}</span>
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span dir="ltr" className={`text-xs font-semibold tabular-nums ${rate.change === 0 ? 'text-fg-subtle' : ch.up ? 'text-up' : 'text-down'}`}>
          {rate.change === 0 ? (locale === 'ur' ? 'کوئی تبدیلی نہیں' : 'No change') : ch.text}
        </span>
        {rate.spark.length > 1 && <Sparkline values={rate.spark} positive={ch.up} />}
      </div>
    </Link>
  )
}
