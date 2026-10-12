import Link from 'next/link'
import { ArrowDownRight, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarClock, Gauge, Sparkles } from 'lucide-react'
import type { ArticleCard, Locale, RateTick } from '@zaviya/shared'
import { TimeAgo } from '@/components/article/TimeAgo'
import { formatNumber } from '@/lib/format'
import type { UpcomingEvent } from '@/lib/queries'
import { localePath } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const RATE_ORDER = ['gold_24k_tola', 'usd_interbank', 'usd_open_sell', 'petrol_super'] as const
const RATE_LABEL: Record<string, [string, string]> = {
  gold_24k_tola: ['Gold 24K / tola', 'سونا 24 قیراط / تولہ'],
  usd_interbank: ['Dollar (interbank)', 'ڈالر (انٹربینک)'],
  usd_open_sell: ['Dollar (open market)', 'ڈالر (اوپن مارکیٹ)'],
  petrol_super: ['Petrol / litre', 'پیٹرول / لیٹر'],
}

function Block({ title, icon: Icon, href, more, tone, children }: {
  title: string
  icon: typeof Gauge
  href: string
  more: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', tone)}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {title}
        </h2>
        <Link href={href} className="flex items-center gap-1 text-xs font-bold text-accent hover:underline">
          {more}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
      {children}
    </section>
  )
}

/** Tiny trend line for a rate (last readings), coloured by direction */
function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return null
  const w = 64
  const h = 22
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-5 w-16 shrink-0" aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={up ? 'stroke-emerald-500' : 'stroke-red-500'} />
    </svg>
  )
}

function daysUntil(date: string): number {
  const today = Date.parse(new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10))
  return Math.round((Date.parse(date) - today) / 86_400_000)
}

function Headlines({ items, locale }: { items: ArticleCard[]; locale: Locale }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id}>
          <Link href={a.href} className="group block py-2.5">
            <span className="headline-hover line-clamp-2 text-[0.93rem] font-semibold leading-snug">{a.title}</span>
            <TimeAgo iso={a.publishedAt} locale={locale} className="mt-1 block text-xs text-fg-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * "Today's briefing" beside the Latest rail: the rates people check daily, plus the newest AI and
 * jobs stories, so the eye always lands on something useful.
 */
export function BriefingRail({ locale, rates, ai, jobs, upcoming }: { locale: Locale; rates: RateTick[]; ai: ArticleCard[]; jobs: ArticleCard[]; upcoming: UpcomingEvent[] }) {
  const isUr = locale === 'ur'
  const tiles = RATE_ORDER.map((s) => rates.find((r) => r.series === s)).filter((r): r is RateTick => Boolean(r))
  return (
    <aside className="card-surface grid content-start gap-6 p-5 md:p-6 lg:col-span-2 lg:grid-cols-3 xl:col-span-1 xl:grid-cols-1" aria-label={isUr ? 'آج کی بریفنگ' : "Today's briefing"}>
      {tiles.length > 0 && (
        <Block title={isUr ? 'آج کے ریٹ' : "Today's rates"} icon={Gauge} href={localePath(locale, '/gold-rate-today-pakistan')} more={isUr ? 'تمام' : 'All rates'} tone="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <ul className="grid gap-2">
            {tiles.map((r) => {
              const up = r.change > 0
              const down = r.change < 0
              return (
                <li key={r.series}>
                  <Link href={r.href} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 hover:bg-accent-soft">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg-muted">{RATE_LABEL[r.series]?.[isUr ? 1 : 0] ?? r.label}</span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="font-display text-base font-bold tabular-nums">{formatNumber(r.value, locale)}</span>
                        {r.change !== 0 && (
                          <span className={cn('flex items-center text-xs font-bold tabular-nums', up ? 'text-emerald-600' : 'text-red-600')}>
                            {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : down ? <ArrowDownRight className="h-3.5 w-3.5" aria-hidden /> : null}
                            {formatNumber(Math.abs(r.change), locale)}
                          </span>
                        )}
                      </span>
                    </span>
                    <Spark values={r.spark ?? []} up={!down} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Block>
      )}
      {upcoming.length > 0 && (
        <Block title={isUr ? 'آنے والی تاریخیں' : 'Coming up'} icon={CalendarClock} href={localePath(locale, '/live')} more={isUr ? 'تازہ' : 'Latest'} tone="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          <ul className="grid gap-2">
            {upcoming.map((e) => {
              const days = daysUntil(e.date)
              const when = days <= 0 ? (isUr ? 'آج' : 'Today') : days === 1 ? (isUr ? 'کل' : 'Tomorrow') : isUr ? `${days} دن` : `in ${days} days`
              const row = (
                <span className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1 leading-none">
                    <span className="text-[10px] font-bold uppercase text-fg-subtle">{new Date(e.date).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>
                    <span className="font-display text-lg font-bold">{new Date(e.date).getUTCDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[0.9rem] font-semibold leading-snug">{e.title}</span>
                    <span className={cn('text-xs font-bold', days <= 1 ? 'text-breaking' : 'text-fg-subtle')}>{when}</span>
                  </span>
                </span>
              )
              return <li key={`${e.date}-${e.title}`}>{e.href ? <Link href={e.href.startsWith('/') ? localePath(locale, e.href) : e.href}>{row}</Link> : row}</li>
            })}
          </ul>
        </Block>
      )}
      {ai.length > 0 && (
        <Block title={isUr ? 'اے آئی' : 'AI now'} icon={Sparkles} href={localePath(locale, '/ai')} more={isUr ? 'مزید' : 'More AI'} tone="bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
          <Headlines items={ai} locale={locale} />
        </Block>
      )}
      {jobs.length > 0 && (
        <Block title={isUr ? 'نوکریاں' : 'Latest jobs'} icon={BriefcaseBusiness} href={localePath(locale, '/education-jobs')} more={isUr ? 'مزید' : 'All jobs'} tone="bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300">
          <Headlines items={jobs} locale={locale} />
        </Block>
      )}
    </aside>
  )
}
