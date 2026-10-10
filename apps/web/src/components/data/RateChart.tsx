'use client'

import { useMemo, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { formatNumber } from '@/lib/format'

type Point = { t: string; v: number }

export function RateChart({ locale, points }: { locale: Locale; points: Point[] }) {
  const d = t(locale)
  const [range, setRange] = useState<'7' | '30' | '365'>('7')
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)

  const filtered = useMemo(() => {
    const days = range === '7' ? 7 : range === '30' ? 30 : 365
    return points.slice(-days)
  }, [points, range])

  const w = 600
  const h = 200
  const pad = 8
  const min = Math.min(...filtered.map((p) => p.v))
  const max = Math.max(...filtered.map((p) => p.v))
  const span = max - min || 1

  const coords = filtered.map((p, i) => ({
    ...p,
    x: pad + (i / Math.max(filtered.length - 1, 1)) * (w - pad * 2),
    y: pad + (1 - (p.v - min) / span) * (h - pad * 2),
  }))

  const line = coords.map((c) => `${c.x},${c.y}`).join(' ')

  return (
    <div className="my-8">
      <div className="mb-4 flex gap-2">
        {(['7', '30', '365'] as const).map((r) => (
          <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => setRange(r)}>
            {r === '7' ? d.chart['7d'] : r === '30' ? d.chart['30d'] : d.chart['1y']}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-full" role="img" aria-label="Rate history chart">
          <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={line} />
          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r="4"
              fill="var(--accent)"
              onMouseEnter={() => setHover({ i, x: c.x, y: c.y })}
              onMouseLeave={() => setHover(null)}
            />
          ))}
          {hover && (
            <text x={hover.x} y={hover.y - 10} textAnchor="middle" className="fill-fg text-[10px] tabular-nums">
              {formatNumber(filtered[hover.i]!.v, locale)}
            </text>
          )}
        </svg>
        <table className="sr-only">
          <caption>Chart data</caption>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.t}>
                <td>{p.t}</td>
                <td>{p.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
