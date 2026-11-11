import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus, Share2 } from 'lucide-react'
import { formatPkr } from '@zaviya/shared'
import { PriceHistoryChart } from '@/components/appliances/PriceCharts'
import { absoluteUrl } from '@/lib/seo'
import { cn } from '@/lib/utils'
import { buildSeries, changeOver, chartState, dayKey, seriesStats, type Change, type SeriesPoint } from '@/lib/appliances/series'
import { fullName, type ApplianceView } from '@/lib/appliances/logic'

const rs = (n: number) => formatPkr(Math.round(n))
const dayText = (t: number | string, withYear = true) =>
  new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Asia/Karachi' })

export function seriesOf(a: Pick<ApplianceView, 'priceHistory' | 'pricePkr' | 'priceUpdatedAt'>): SeriesPoint[] {
  return buildSeries(a.priceHistory, a.pricePkr, a.priceUpdatedAt)
}

/** "+Rs 120 (4.2%)" with an arrow; a price that went up is red-ish for a shopper, down is green */
export function ChangeBadge({ change, label, className }: { change: Change | null; label?: string; className?: string }) {
  if (!change) return null
  const up = change.abs > 0
  const flat = change.abs === 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums', flat ? 'bg-surface-2 text-fg-muted' : up ? 'bg-red-50 text-down dark:bg-red-950/40' : 'bg-accent-soft text-up', className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {flat ? 'No change' : `${up ? '+' : '-'}${rs(Math.abs(change.abs))} (${Math.abs(change.pct)}%)`}
      {label ? <span className="font-medium opacity-80">{label}</span> : null}
    </span>
  )
}

/** WhatsApp is how Pakistan shares: a ready message with the price and the link */
export function WhatsAppShare({ a, path, className }: { a: Pick<ApplianceView, 'name' | 'pricePkr' | 'unit' | 'brand'>; path: string; className?: string }) {
  if (!a.pricePkr) return null
  const url = `${absoluteUrl(path)}?utm_source=whatsapp&utm_medium=share&utm_campaign=price`
  const text = `${a.brand.kind === 'source' ? a.name : `${a.brand.name} ${a.name}`}: ${rs(a.pricePkr)}${a.unit ? ` (${a.unit})` : ''}. Aaj ka official rate, price history ke saath: ${url}`
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 font-semibold text-white hover:brightness-95', className)}
      data-testid="share-whatsapp"
    >
      <Share2 className="h-4 w-4" aria-hidden />
      Share on WhatsApp
    </a>
  )
}

/** Price history: change since last week and month, the range, and a step chart (or "Tracking since" while there is nothing to draw) */
export function PriceTrendSection({ a, id = 'history' }: { a: ApplianceView; id?: string }) {
  const series = seriesOf(a)
  const state = chartState(series)
  const stats = seriesStats(series)
  const week = changeOver(series, 7)
  const month = changeOver(series, 30)
  const recorded = series.filter((p) => p.real).slice().reverse()
  const grocery = a.brand.kind === 'source'
  return (
    <section aria-labelledby={id} className="card-surface p-4 md:p-5">
      <h2 id={id} className="font-display text-xl font-bold">
        {fullName(a)} price history
      </h2>
      {state === 'none' || !stats ? (
        <p className="mt-3 text-sm text-fg-muted">We have not recorded a price for this item yet.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-fg-muted">
            Tracking since {dayText(stats.first.t)}
            {stats.changes ? ` · ${stats.changes} price change${stats.changes === 1 ? '' : 's'} recorded` : stats.spanDays >= 1 ? ` · no change in ${stats.spanDays} days` : ''}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile label="Since last week" change={week} empty="Not enough history yet" />
            <StatTile label="Since last month" change={month} empty="Not enough history yet" />
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-semibold text-fg-subtle">Lowest recorded</p>
              <p className="font-display text-lg font-extrabold tabular-nums">{rs(stats.min.price)}</p>
              <p className="text-xs text-fg-muted">{dayText(stats.min.t, false)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs font-semibold text-fg-subtle">Highest recorded</p>
              <p className="font-display text-lg font-extrabold tabular-nums">{rs(stats.max.price)}</p>
              <p className="text-xs text-fg-muted">{dayText(stats.max.t, false)}</p>
            </div>
          </div>
          <div className="mt-4">
            {state === 'chart' ? (
              <PriceHistoryChart points={series.map((p) => ({ t: p.t, price: p.price, real: p.real }))} unit={a.unit} />
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-bg p-5 text-center" data-testid="tracking-since">
                <p className="font-display text-lg font-bold">Tracking since {dayText(stats.first.t)}</p>
                <p className="mx-auto mt-1 max-w-[46ch] text-sm text-fg-muted">
                  The price has been {rs(stats.last.price)} so far. We check {grocery ? 'the official weekly release' : 'the official source'} {grocery ? 'every week' : 'every day'}, and the chart appears here as soon as there is a week of history or a change.
                </p>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            Step line: the price holds until the next recorded change. Dots are recorded prices; the line runs to the last check on {dayText(stats.last.t)}.
          </p>
          {recorded.length > 1 ? (
            <details className="mt-3 rounded-xl border border-border p-3 text-sm">
              <summary className="cursor-pointer font-semibold">All {recorded.length} recorded prices, with source</summary>
              <ul className="mt-2 divide-y divide-border">
                {recorded.slice(0, 60).map((p) => (
                  <li key={p.t} className="flex items-center justify-between gap-3 py-1.5">
                    <span>{dayText(p.t)}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{rs(p.price)}</span>
                      {p.sourceUrl ? (
                        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Source of the ${dayKey(p.t)} price`} className="text-fg-subtle hover:text-accent">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  )
}

function StatTile({ label, change, empty }: { label: string; change: Change | null; empty: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="text-xs font-semibold text-fg-subtle">{label}</p>
      {change ? (
        <>
          <p className="font-display text-lg font-extrabold tabular-nums">{change.abs === 0 ? 'No change' : `${change.abs > 0 ? '+' : '-'}${Math.abs(change.pct)}%`}</p>
          <p className="text-xs text-fg-muted tabular-nums">{change.abs === 0 ? rs(change.to) : `${change.abs > 0 ? '+' : '-'}${rs(Math.abs(change.abs))}`}</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-fg-muted">{empty}</p>
      )}
    </div>
  )
}

/** A row in "today's movers" */
export function MoverRow({ href, name, sub, from, to, pct, when }: { href: string; name: string; sub?: string; from: number; to: number; pct: number; when: number }) {
  const up = pct > 0
  return (
    <li className="min-w-0">
      <Link href={href} className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2">
        <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full', up ? 'bg-red-50 text-down dark:bg-red-950/40' : 'bg-accent-soft text-up')}>
          {up ? <ArrowUpRight className="h-5 w-5" aria-hidden /> : <ArrowDownRight className="h-5 w-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block truncate text-xs text-fg-muted">
            {rs(from)} to {rs(to)} · {dayText(when, false)}
            {sub ? ` · ${sub}` : ''}
          </span>
        </span>
        <span className={cn('shrink-0 font-display text-base font-extrabold tabular-nums', up ? 'text-down' : 'text-up')}>
          {up ? '+' : '-'}
          {Math.abs(pct)}%
        </span>
      </Link>
    </li>
  )
}
