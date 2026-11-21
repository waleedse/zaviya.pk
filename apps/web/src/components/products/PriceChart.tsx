import { formatPkr } from '@zaviya/shared'
import type { PricePoint } from '@/lib/search/history'

/** Lowest price over time as a small SVG line. Needs at least two different days; otherwise nothing is drawn. */
export function PriceChart({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null
  const min = Math.min(...points.map((p) => p.price))
  const max = Math.max(...points.map((p) => p.price))
  const W = 600
  const H = 120
  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => (max === min ? H / 2 : H - 10 - ((v - min) / (max - min)) * (H - 20))
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]!
  const first = points[0]!
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Price history</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-xl" role="img" aria-label={`Lowest price from ${formatPkr(first.price)} to ${formatPkr(last.price)}`}>
        <path d={d} fill="none" stroke="#0f766e" strokeWidth="2" />
      </svg>
      <p className="text-xs text-neutral-500">
        Lowest store price, {first.day} to {last.day}: from {formatPkr(first.price)} to {formatPkr(last.price)} (low {formatPkr(min)}, high {formatPkr(max)}).
      </p>
    </section>
  )
}
