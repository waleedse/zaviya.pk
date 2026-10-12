import Link from 'next/link'
import { ArrowDownRight, ArrowRight, ArrowUpRight, BriefcaseBusiness, Gauge, Sparkles } from 'lucide-react'
import type { ArticleCard, Locale, RateTick } from '@zaviya/shared'
import { TimeAgo } from '@/components/article/TimeAgo'
import { formatNumber } from '@/lib/format'
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
export function BriefingRail({ locale, rates, ai, jobs }: { locale: Locale; rates: RateTick[]; ai: ArticleCard[]; jobs: ArticleCard[] }) {
  const isUr = locale === 'ur'
  const tiles = RATE_ORDER.map((s) => rates.find((r) => r.series === s)).filter((r): r is RateTick => Boolean(r))
  return (
    <aside className="card-surface grid gap-6 p-5 md:p-6 lg:col-span-2 lg:grid-cols-3 xl:col-span-1 xl:grid-cols-1" aria-label={isUr ? 'آج کی بریفنگ' : "Today's briefing"}>
      {tiles.length > 0 && (
        <Block title={isUr ? 'آج کے ریٹ' : "Today's rates"} icon={Gauge} href={localePath(locale, '/gold-rate-today-pakistan')} more={isUr ? 'تمام' : 'All rates'} tone="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <ul className="grid gap-2">
            {tiles.map((r) => {
              const up = r.change > 0
              const down = r.change < 0
              return (
                <li key={r.series}>
                  <Link href={r.href} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5 hover:bg-accent-soft">
                    <span className="text-sm text-fg-muted">{RATE_LABEL[r.series]?.[isUr ? 1 : 0] ?? r.label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-display text-base font-bold tabular-nums">{formatNumber(r.value, locale)}</span>
                      {up && <ArrowUpRight className="h-4 w-4 text-emerald-600" aria-label={isUr ? 'اضافہ' : 'up'} />}
                      {down && <ArrowDownRight className="h-4 w-4 text-red-600" aria-label={isUr ? 'کمی' : 'down'} />}
                    </span>
                  </Link>
                </li>
              )
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
