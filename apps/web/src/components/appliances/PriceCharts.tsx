'use client'

import { useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'

/** Charts for /prices (Recharts). Props are plain data so server pages can pass them in. Colours are the site's own tokens. */

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`
const short = (n: number) => (n >= 10_000_000 ? `${(n / 10_000_000).toFixed(1)} cr` : n >= 100_000 ? `${(n / 100_000).toFixed(n >= 1_000_000 ? 0 : 1)} lac` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString('en-US'))
const dayFmt = (t: number, withYear = false) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Asia/Karachi' })
const monthFmt = (t: number) => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'Asia/Karachi' })

export interface ChartPoint {
  t: number
  price: number
  real: boolean
}

const RANGES = [
  { key: '1m', label: '1M', days: 31 },
  { key: '3m', label: '3M', days: 93 },
  { key: '1y', label: '1Y', days: 366 },
  { key: 'all', label: 'All', days: Infinity },
] as const

/** Step line: the price holds until the next recorded change. Dots mark recorded prices only. */
export function PriceHistoryChart({ points, unit }: { points: ChartPoint[]; unit?: string }) {
  const span = points.length ? points.at(-1)!.t - points[0]!.t : 0
  const spanDays = span / 86_400_000
  // range buttons only when the record is longer than a month, and only ranges shorter than the record
  const ranges = spanDays <= 31 ? [] : RANGES.filter((r) => r.key === 'all' || r.days < spanDays)
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('all')
  const shown = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days
    if (!Number.isFinite(days) || !points.length) return points
    const from = points.at(-1)!.t - days * 86_400_000
    const inside = points.filter((p) => p.t >= from)
    const before = [...points].reverse().find((p) => p.t < from)
    // the price in force at the start of the window keeps the line honest
    return before ? [{ ...before, t: from, real: false }, ...inside] : inside
  }, [points, range])

  const prices = shown.map((p) => p.price)
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const pad = hi === lo ? hi * 0.05 : Math.max((hi - lo) * 0.25, hi * 0.01)
  const long = shown.length > 1 && shown.at(-1)!.t - shown[0]!.t > 150 * 86_400_000

  return (
    <div>
      {ranges.length > 1 ? (
        <div className="mb-2 flex gap-1.5" role="group" aria-label="Chart range">
          {ranges.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={cn('h-8 min-w-11 rounded-full border px-3 text-xs font-bold', range === r.key ? 'border-transparent bg-accent text-accent-fg' : 'border-border bg-surface text-fg-muted hover:border-accent')}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="h-[230px] w-full md:h-[280px]" role="img" aria-label={`Price history${unit ? ` for ${unit}` : ''}: from ${rs(shown[0]?.price ?? 0)} to ${rs(shown.at(-1)?.price ?? 0)}`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 230 }}>
          <AreaChart data={shown} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="phFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(t: number) => (long ? monthFmt(t) : dayFmt(t))}
              tickCount={4}
              tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              minTickGap={28}
            />
            <YAxis
              domain={[Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)]}
              tickFormatter={(v: number) => short(v)}
              tickCount={4}
              tick={{ fontSize: 11, fill: 'var(--fg-subtle)' }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            {hi !== lo ? <ReferenceLine y={hi} stroke="var(--down)" strokeDasharray="4 4" strokeOpacity={0.6} /> : null}
            {hi !== lo ? <ReferenceLine y={lo} stroke="var(--up)" strokeDasharray="4 4" strokeOpacity={0.6} /> : null}
            <Tooltip
              cursor={{ stroke: 'var(--fg-subtle)', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as ChartPoint | undefined) : undefined
                if (!p) return null
                return (
                  <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-[var(--shadow-card)]">
                    <p className="font-display font-extrabold tabular-nums">{rs(p.price)}</p>
                    <p className="text-xs text-fg-muted">{dayFmt(p.t, true)}</p>
                  </div>
                )
              }}
            />
            <Area
              type="stepAfter"
              dataKey="price"
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill="url(#phFill)"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: ChartPoint; index?: number }) =>
                props.payload?.real && props.cx != null && props.cy != null ? (
                  <circle key={`d${props.index}`} cx={props.cx} cy={props.cy} r={shown.length > 40 ? 2.5 : 4} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
                ) : (
                  <g key={`d${props.index}`} />
                )
              }
              activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Price history</caption>
        <tbody>
          {shown.slice(-60).map((p) => (
            <tr key={p.t}>
              <td>{dayFmt(p.t, true)}</td>
              <td>{rs(p.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface CityBar {
  city: string
  avg: number
  min?: number | null
  max?: number | null
}

/** Horizontal bars, cheapest city on top; the cheapest is green, the costliest red, the highlighted city (a city page) in the accent colour */
export function CityBarChart({ rows, highlight }: { rows: CityBar[]; highlight?: string }) {
  const data = [...rows].sort((a, b) => a.avg - b.avg)
  const lo = data[0]?.avg ?? 0
  const hi = data.at(-1)?.avg ?? 0
  // bars start near the lowest price so differences are visible; the axis says so
  const base = Math.max(0, Math.floor((lo * 0.85) / 10) * 10)
  const color = (c: CityBar) => (c.city === highlight ? 'var(--accent)' : c.avg === lo ? 'var(--up)' : c.avg === hi && hi !== lo ? 'var(--down)' : 'color-mix(in oklab, var(--accent) 45%, var(--surface-2))')
  const height = data.length * 30 + 28
  return (
    <div>
      <div style={{ height }} className="w-full" role="img" aria-label="Price by city, cheapest first">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height }}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap={4}>
            <XAxis type="number" domain={[base, 'dataMax']} hide />
            <YAxis type="category" dataKey="city" width={86} tick={{ fontSize: 12, fill: 'var(--fg)' }} tickLine={false} axisLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={({ active, payload }) => {
                const c = active ? (payload?.[0]?.payload as CityBar | undefined) : undefined
                if (!c) return null
                return (
                  <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-[var(--shadow-card)]">
                    <p className="font-semibold">{c.city}</p>
                    <p className="font-display font-extrabold tabular-nums">{rs(c.avg)} average</p>
                    {c.min && c.max ? <p className="text-xs text-fg-muted">Lowest {rs(c.min)} · highest {rs(c.max)}</p> : null}
                  </div>
                )
              }}
            />
            <Bar dataKey="avg" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {data.map((c) => (
                <Cell key={c.city} fill={color(c)} />
              ))}
              <LabelList dataKey="avg" position="right" formatter={(v) => rs(Number(v))} style={{ fontSize: 11, fill: 'var(--fg-muted)', fontVariantNumeric: 'tabular-nums' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-fg-subtle">Bars start at {rs(base)}, so the gap between cities is easy to see.</p>
    </div>
  )
}
