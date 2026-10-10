import Link from 'next/link'
import type { Locale, RateTick } from '@zaviya/shared'
import { Sparkline } from '@/components/data/Sparkline'
import { formatChange, formatNumber } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'

export function RateCard({ rate, locale }: { rate: RateTick; locale: Locale }) {
  const ch = formatChange(rate.change, rate.changePct, locale)
  const href = locale === 'ur' ? `/ur${rate.href}` : rate.href
  return (
    <Link href={href}>
      <Card className="h-full hover:border-accent/40">
        <CardContent className="space-y-2 pt-5">
          <p className="text-sm text-fg-muted">{rate.label}</p>
          <p dir="ltr" className="font-display text-2xl font-semibold tabular-nums">
            {formatNumber(rate.value)}
            <span className="ms-1 text-sm font-normal text-fg-muted">{rate.unit}</span>
          </p>
          <div className="flex items-center justify-between">
            <span dir="ltr" className={`text-sm tabular-nums ${ch.up ? 'text-up' : 'text-down'}`}>
              {ch.text}
            </span>
            <Sparkline values={rate.spark} positive={ch.up} />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
