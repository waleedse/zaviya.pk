import type { Locale, RateTick } from '@zaviya/shared'
import { formatChange, formatDateTime, formatNumber } from '@/lib/format'
import { t } from '@/lib/i18n'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import Link from 'next/link'

export function TopBar({ locale, rates, langHref }: { locale: Locale; rates: RateTick[]; langHref: string }) {
  const d = t(locale)
  const now = new Date().toISOString()
  const dateLabel = formatDateTime(now, locale, { dateStyle: 'medium', time: false })

  return (
    <div className="hidden border-b border-border bg-surface-2/80 text-xs text-fg-muted md:block">
      <div className="container-page flex h-8 items-center justify-between gap-4">
        <div className="flex items-center gap-4 overflow-hidden">
          <span className="shrink-0 tabular-nums">{dateLabel} PKT</span>
          <div className="flex items-center gap-3 overflow-x-auto">
            {rates.map((r) => {
              const ch = formatChange(r.change, r.changePct, locale)
              return (
                <Link key={r.series} href={locale === 'ur' ? `/ur${r.href}` : r.href} className="flex shrink-0 items-center gap-1 hover:text-accent">
                  <span>{r.label}</span>
                  <span dir="ltr" className="tabular-nums font-medium text-fg">
                    {formatNumber(r.value)}
                  </span>
                  <span dir="ltr" className={ch.up ? 'text-up' : 'text-down'}>
                    {ch.text.split(' ')[0]}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitch locale={locale} href={langHref} />
          <ThemeToggle locale={locale} />
        </div>
      </div>
    </div>
  )
}

export function RatesStripMobile({ locale, rates }: { locale: Locale; rates: RateTick[] }) {
  return (
    <div className="border-b border-border bg-surface-2/80 py-2 md:hidden">
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 text-xs">
        {rates.map((r) => (
          <Link key={r.series} href={locale === 'ur' ? `/ur${r.href}` : r.href} className="flex shrink-0 snap-start flex-col rounded-md border border-border bg-surface px-3 py-2">
            <span className="text-fg-muted">{r.label}</span>
            <span dir="ltr" className="tabular-nums font-semibold text-fg">
              {formatNumber(r.value)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
