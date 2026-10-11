'use client'

import { ArrowRight, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import type { Locale, RateTick } from '@zaviya/shared'
import { formatChange, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

function sparkPoints(values: number[], w = 280, h = 64) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const line = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 6 - ((v - min) / span) * (h - 12)).toFixed(1)}`).join(' ')
  return { line, area: `0,${h} ${line} ${w},${h}` }
}

const SHORT: Record<string, [string, string]> = {
  gold_24k_tola: ['Gold 24K', 'سونا'],
  gold_22k_tola: ['Gold 22K', 'سونا 22'],
  usd_interbank: ['Dollar', 'ڈالر'],
  usd_open_buy: ['Open buy', 'اوپن خرید'],
  usd_open_sell: ['Open mkt', 'اوپن'],
  petrol_super: ['Petrol', 'پیٹرول'],
  hsd: ['Diesel', 'ڈیزل'],
  kerosene: ['Kerosene', 'مٹی کا تیل'],
}

/** Tabbed rates card for the dark "Your day" band. */
export function RatesWidget({ locale, rates }: { locale: Locale; rates: RateTick[] }) {
  const isUr = locale === 'ur'
  const [active, setActive] = useState(rates[0]?.series)
  const rate = rates.find((r) => r.series === active) ?? rates[0]
  if (!rate) return null
  const ch = formatChange(rate.change, rate.changePct, locale)
  const flat = rate.change === 0
  const spark = sparkPoints(rate.spark)
  const href = isUr ? `/ur${rate.href}` : rate.href
  const observed = new Intl.DateTimeFormat(isUr ? 'ur-PK' : 'en-GB', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }).format(
    new Date(rate.observedAt),
  )

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 rounded-[22px] border border-ink-line bg-ink-2 p-5 text-ink-muted md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 font-sans text-[17px] font-extrabold text-ink-fg">
          <span className="icon-tile h-9 w-9 bg-amber-950 text-amber-300">
            <TrendingUp className="h-[18px] w-[18px]" aria-hidden />
          </span>
          {isUr ? 'آج کے ریٹ' : 'Rates today'}
        </h3>
        <span className="text-xs">{observed}</span>
      </div>

      <div role="tablist" aria-label={isUr ? 'ریٹ' : 'Rates'} className="grid gap-1 rounded-xl bg-ink p-1" style={{ gridTemplateColumns: `repeat(${Math.min(rates.length, 4)}, minmax(0, 1fr))` }}>
        {rates.slice(0, 4).map((r) => (
          <button
            key={r.series}
            role="tab"
            type="button"
            aria-selected={r.series === rate.series}
            onClick={() => setActive(r.series)}
            className={cn(
              'h-9 truncate rounded-lg px-2 text-[13px] font-bold transition-colors',
              r.series === rate.series ? 'bg-amber-400 text-[#0b1220]' : 'text-ink-muted hover:text-ink-fg',
            )}
          >
            {SHORT[r.series]?.[isUr ? 1 : 0] ?? r.label}
          </button>
        ))}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{rate.label}</p>
          <p dir="ltr" className="font-display text-[2.4rem] font-extrabold leading-tight text-white tabular-nums rtl:text-end">
            {formatNumber(rate.value)}
          </p>
          <p className="text-[13px]">{rate.unit}</p>
        </div>
        <span
          dir="ltr"
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1.5 text-[13px] font-extrabold tabular-nums',
            flat ? 'bg-ink-line text-slate-300' : ch.up ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300',
          )}
        >
          {flat ? (isUr ? 'کوئی تبدیلی نہیں' : 'No change') : ch.text}
        </span>
      </div>

      {spark && (
        <svg viewBox="0 0 280 64" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label={isUr ? 'حالیہ رجحان' : 'Recent trend'}>
          <polygon points={spark.area} className={flat ? 'fill-slate-400/10' : ch.up ? 'fill-emerald-400/15' : 'fill-rose-400/15'} />
          <polyline
            points={spark.line}
            fill="none"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={flat ? 'stroke-slate-400' : ch.up ? 'stroke-emerald-400' : 'stroke-rose-400'}
          />
        </svg>
      )}

      <div className="divide-y divide-ink-line border-t border-ink-line">
        {rates.map((r) => (
          <Link key={r.series} href={isUr ? `/ur${r.href}` : r.href} className="flex justify-between py-2.5 text-sm hover:text-ink-fg">
            <span>{r.label}</span>
            <b dir="ltr" className="text-white tabular-nums">
              {formatNumber(r.value)}
            </b>
          </Link>
        ))}
      </div>

      <Link href={href} className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-amber-300 hover:text-amber-200">
        {isUr ? 'تمام ریٹ اور تاریخ' : 'Full rates & history'}
        <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  )
}
