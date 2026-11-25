'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPkr, type ProductOffer } from '@zaviya/shared'
import { compareHref, discountPct, sortOffers } from '@/lib/search/product-pure'

/** Picture gallery: big picture plus thumbnails, each credited to the store whose listing it comes from */
export function Gallery({ images, title }: { images: { url: string; store: string }[]; title: string }) {
  const [i, setI] = useState(0)
  const cur = images[Math.min(i, images.length - 1)]
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex aspect-square max-h-[520px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-white">
        {cur ? <img src={cur.url} alt={title} className="h-full w-full object-contain" loading="eager" /> : <span className="text-sm text-fg-subtle">No picture yet</span>}
      </div>
      {images.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Product pictures">
          {images.map((im, n) => (
            <button key={im.url} type="button" role="tab" aria-selected={n === i} aria-label={`Picture ${n + 1} from ${im.store}`} onClick={() => setI(n)} className={`h-[72px] w-[72px] overflow-hidden rounded-xl border-2 bg-white ${n === i ? 'border-accent' : 'border-border'}`}>
              <img src={im.url} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      ) : null}
      {cur ? <p className="text-xs text-fg-subtle">Picture from the {cur.store} listing.</p> : null}
    </div>
  )
}

const initial = (s: string) => s.trim().charAt(0).toUpperCase()

/** Every store's offer, cheapest first; toggles for discount order and in-stock only */
export function OffersTable({ offers }: { offers: ProductOffer[] }) {
  const [by, setBy] = useState<'price' | 'discount'>('price')
  const [stockOnly, setStockOnly] = useState(false)
  const rows = useMemo(() => sortOffers(offers, by).filter((o) => !stockOnly || o.in_stock), [offers, by, stockOnly])
  const bestInStock = Math.min(...offers.filter((o) => o.in_stock).map((o) => o.price), Infinity)
  const pill = (on: boolean) => `h-10 rounded-full border px-4 text-sm font-semibold ${on ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface text-fg'}`
  return (
    <section aria-labelledby="offers-h" className="card-surface p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="offers-h" className="font-display text-xl font-bold md:text-2xl">Prices at {offers.length} store{offers.length === 1 ? '' : 's'}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={pill(by === 'price')} onClick={() => setBy('price')}>Cheapest first</button>
          <button type="button" className={pill(by === 'discount')} onClick={() => setBy('discount')}>Biggest discount</button>
          <button type="button" className={pill(stockOnly)} aria-pressed={stockOnly} onClick={() => setStockOnly((v) => !v)}>{stockOnly ? '✓ ' : ''}In stock only</button>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-border">
        {rows.map((o) => {
          const best = o.in_stock && o.price === bestInStock && o === rows.find((x) => x.in_stock && x.price === bestInStock)
          const off = discountPct(o)
          const diff = o.price - bestInStock
          return (
            <li key={o.store + o.url} className={`flex flex-wrap items-center gap-3 py-4 ${best ? 'rounded-xl bg-accent-soft px-3' : ''} ${o.in_stock ? '' : 'opacity-75'}`}>
              <div className="flex min-w-[200px] flex-1 items-center gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-surface-2 font-extrabold text-fg-muted">{initial(o.store_name)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{o.store_name}</span>{best ? <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-bold text-accent-fg">Best</span> : null}</div>
                  <div className="text-xs text-fg-subtle">Checked {new Date(o.updated_at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })}</div>
                </div>
              </div>
              <div className="min-w-[110px]">
                <div className="text-lg font-extrabold">{formatPkr(o.price)}</div>
                {o.list_price ? <div className="text-xs text-fg-subtle line-through">{formatPkr(o.list_price)}</div> : null}
              </div>
              <div className="min-w-[70px] text-sm font-bold text-amber">{off >= 3 ? `−${off}%` : ''}</div>
              <div className="min-w-[120px] text-sm text-fg-muted">{!Number.isFinite(bestInStock) ? '' : diff === 0 && o.in_stock ? 'Same as best' : diff > 0 ? `+${formatPkr(diff)}` : `${formatPkr(-diff)} less, no stock`}</div>
              <div className={`min-w-[90px] text-sm font-bold ${o.in_stock ? 'text-up' : 'text-down'}`}>{o.in_stock ? 'In stock' : 'Out of stock'}</div>
              <a href={o.url} target="_blank" rel="noopener nofollow sponsored" className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-bold ${o.in_stock ? 'bg-accent text-accent-fg' : 'border border-border bg-surface text-fg'}`}>
                {o.in_stock ? 'Go to store ↗' : 'Check store ↗'}
              </a>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-fg-subtle">We link to the store. Zaviya sells nothing and prices are the stores' own, read from their sites.</p>
    </section>
  )
}

export interface HistoryPoint { day: string; price: number }

/** Dark price-history card: range tabs, lowest / average / highest, smooth area chart with a hover readout and a plain "good time to buy" line */
export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const [range, setRange] = useState<'7D' | '30D' | '90D'>('90D')
  const [hover, setHover] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const days = range === '7D' ? 7 : range === '30D' ? 30 : 90
  const pts = useMemo(() => points.slice(-days), [points, days])
  useEffect(() => setHover(null), [range])
  if (points.length < 2) return null
  const prices = pts.map((p) => p.price)
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length
  const last = pts.at(-1)!
  const W = 560
  const H = 200
  const pad = (hi - lo || hi * 0.05 || 1) * 0.15
  const y = (v: number) => 12 + (1 - (v - (lo - pad)) / (hi + pad - (lo - pad))) * (H - 24)
  const x = (i: number) => (pts.length === 1 ? 0 : (i / (pts.length - 1)) * W)
  let d = `M${x(0).toFixed(1)},${y(pts[0]!.price).toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const cx = (x(i - 1) + x(i)) / 2
    d += ` C${cx.toFixed(1)},${y(pts[i - 1]!.price).toFixed(1)} ${cx.toFixed(1)},${y(pts[i]!.price).toFixed(1)} ${x(i).toFixed(1)},${y(pts[i]!.price).toFixed(1)}`
  }
  const at = hover ?? pts.length - 1
  const hp = pts[at]!
  const near = last.price <= lo + (hi - lo) * 0.15
  const tipLeft = x(at) > W * 0.6
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect()
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1)))))
  }
  const tab = (r: '7D' | '30D' | '90D') => `h-8 rounded-full px-3 text-[13px] font-bold ${range === r ? 'bg-[#2DD4B0] text-[#0F1A1C]' : 'text-[#A9B4B0]'}`
  const fmtDay = (s: string) => new Date(s + 'T00:00:00+05:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <section aria-labelledby="hist-h" className="flex flex-col gap-4 rounded-2xl bg-[#0F1A1C] p-5 text-[#F3F5F2] md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="hist-h" className="font-display text-xl font-bold text-white">Price history</h2><p className="text-[13px] text-[#A9B4B0]">Lowest price per day, all stores</p></div>
        <div role="tablist" aria-label="Range" className="flex gap-1 rounded-full bg-[#1D2A2C] p-1">
          {(['7D', '30D', '90D'] as const).map((r) => (
            <button key={r} type="button" role="tab" aria-selected={range === r} className={tab(r)} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[['Lowest', lo, 'text-[#5EE0C1]'], ['Average', avg, 'text-white'], ['Highest', hi, 'text-[#F5A97F]']].map(([l, v, c]) => (
          <div key={String(l)} className="rounded-xl bg-[#172426] p-3"><span className="block text-xs text-[#A9B4B0]">{l}</span><span className={`text-base font-extrabold md:text-lg ${c}`}>{formatPkr(Math.round(v as number))}</span></div>
        ))}
      </div>
      <svg ref={ref} viewBox={`0 0 ${W} ${H + 24}`} className="w-full touch-none" role="img" aria-label={`Lowest price ${formatPkr(Math.round(lo))} to ${formatPkr(Math.round(hi))} over ${pts.length} days, now ${formatPkr(Math.round(last.price))}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs><linearGradient id="ph-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2DD4B0" stopOpacity="0.45" /><stop offset="1" stopColor="#2DD4B0" stopOpacity="0" /></linearGradient></defs>
        {[0.2, 0.5, 0.8].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#24363A" strokeDasharray="3 5" />)}
        <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#ph-fill)" />
        <path d={d} fill="none" stroke="#2DD4B0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={x(at)} x2={x(at)} y1="10" y2={H} stroke="#5EE0C1" strokeOpacity="0.5" />
        <circle cx={x(at)} cy={y(hp.price)} r="6.5" fill="#0F1A1C" stroke="#5EE0C1" strokeWidth="3" />
        <g transform={`translate(${tipLeft ? x(at) - 150 : x(at) + 10},${Math.max(4, Math.min(H - 52, y(hp.price) - 22))})`}>
          <rect width="140" height="44" rx="9" fill="#FFFFFF" />
          <text x="12" y="18" fontSize="12" fill="#5B6270">{fmtDay(hp.day)}</text>
          <text x="12" y="36" fontSize="15" fontWeight="800" fill="#15171C">{formatPkr(Math.round(hp.price))}</text>
        </g>
        <text x="0" y={H + 18} fontSize="12" fill="#A9B4B0">{fmtDay(pts[0]!.day)}</text>
        <text x={W} y={H + 18} fontSize="12" fill="#A9B4B0" textAnchor="end">{fmtDay(last.day)}</text>
      </svg>
      {pts.length >= 14 ? (
        <div className="flex items-center gap-3 rounded-xl bg-[#13302B] px-4 py-3 text-sm text-[#DDF6EF]">
          <span aria-hidden="true" className={`h-2.5 w-2.5 flex-none rounded-full ${near ? 'bg-[#5EE0C1]' : 'bg-[#F5A97F]'}`} />
          {near ? <span><strong>Good time to buy:</strong> today's price is near the lowest we have seen.</span> : <span><strong>Not the lowest:</strong> it was {formatPkr(Math.round(lo))} at its cheapest in this period.</span>}
        </div>
      ) : null}
    </section>
  )
}

interface Hit { id: string; title: string; image: string | null; min_price: number; store_count: number }

/** "Compare with…": type any product, or pick a suggestion; opens /compare-products/<a>/<b>, one page per pair */
export function CompareBox({ id, title, suggestions }: { id: string; title: string; suggestions: Hit[] }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const seq = useRef(0)
  useEffect(() => {
    if (q.trim().length < 2) return setHits([])
    const n = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?${new URLSearchParams({ q, limit: '6' })}`)
        const j = (await r.json()) as { hits?: Hit[] }
        if (n === seq.current) setHits((j.hits ?? []).filter((h) => h.id !== id))
      } catch {}
    }, 120)
    return () => clearTimeout(t)
  }, [q, id])
  const list = q.trim().length >= 2 ? hits : []
  return (
    <section aria-labelledby="cmp-h" className="card-surface p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cmp-h" className="font-display text-xl font-bold md:text-2xl">Compare {title.length > 48 ? 'this product' : title} with…</h2>
        <span className="text-[13px] text-fg-muted">Price, stores and specs side by side</span>
      </div>
      <div className="relative mt-4">
        <label htmlFor="cmp-q" className="sr-only">Search a product to compare</label>
        <div className="flex h-[52px] items-center gap-3 rounded-xl border border-border bg-surface px-4">
          <span className="font-extrabold text-fg-subtle">VS</span>
          <input id="cmp-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type any product to compare" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
        </div>
        {list.length ? (
          <ul className="absolute left-0 right-0 top-14 z-10 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
            {list.map((h) => (
              <li key={h.id}>
                <Link href={compareHref(id, h.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  {h.image ? <img src={h.image} alt="" className="h-10 w-10 rounded-lg bg-white object-contain" loading="lazy" /> : <span className="h-10 w-10 rounded-lg bg-surface-2" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.title}</span>
                  <span className="text-sm font-extrabold text-accent">{formatPkr(h.min_price)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {suggestions.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-muted">Quick picks:</span>
          {suggestions.slice(0, 4).map((s) => (
            <Link key={s.id} href={compareHref(id, s.id)} className="flex items-center gap-2 rounded-xl border border-accent-line bg-accent-soft px-3 py-2 text-sm font-semibold text-accent">
              <span className="max-w-[220px] truncate">vs {s.title}</span><span className="font-medium text-fg-muted">{formatPkr(s.min_price)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}
