'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { formatPkr } from '@zaviya/shared'

interface Offer { store: string; store_name: string; price: number; list_price: number | null; in_stock: boolean; url: string }
interface Hit { id: string; title: string; brand: string | null; image: string | null; offers: Offer[]; min_price: number; max_price: number; store_count: number; in_stock_any: boolean; price_drop_pct: number }
interface Res { total: number; hits: Hit[]; facets: Record<string, Record<string, number>>; ms: number }

/** Instant search as you type: debounced 80 ms, results come from our own Meilisearch through /api/search. */
export function ProductSearch({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery)
  const [sort, setSort] = useState('')
  const [store, setStore] = useState('')
  const [stock, setStock] = useState(false)
  const [res, setRes] = useState<Res | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const id = ++seq.current
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const p = new URLSearchParams({ q, limit: '24' })
        if (sort) p.set('sort', sort)
        if (store) p.set('store', store)
        if (stock) p.set('stock', '1')
        const r = await fetch(`/api/search?${p}`)
        const j = (await r.json()) as Res
        if (id === seq.current) setRes(j)
      } catch {
        /* keep the last results */
      } finally {
        if (id === seq.current) setBusy(false)
      }
      const u = new URL(window.location.href)
      if (q) u.searchParams.set('q', q)
      else u.searchParams.delete('q')
      window.history.replaceState(null, '', u)
    }, 80)
    return () => clearTimeout(t)
  }, [q, sort, store, stock])

  const stores = Object.entries(res?.facets?.stores ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-3 text-2xl font-bold">Search any product in Pakistan</h1>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Phone, glasses, spoon, atta, laptop… (English, Roman Urdu or اردو)"
        className="w-full rounded-lg border px-4 py-3 text-lg"
        aria-label="Search products"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded border px-2 py-1" aria-label="Sort">
          <option value="">Best match</option>
          <option value="price">Cheapest first</option>
          <option value="drop">Biggest price drop</option>
        </select>
        <select value={store} onChange={(e) => setStore(e.target.value)} className="rounded border px-2 py-1" aria-label="Store">
          <option value="">All stores</option>
          {stores.map(([s, n]) => (
            <option key={s} value={s}>{s} ({n})</option>
          ))}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={stock} onChange={(e) => setStock(e.target.checked)} /> In stock only</label>
        {res ? <span className="text-neutral-500">{res.total.toLocaleString('en-US')} products{busy ? '…' : ''}</span> : null}
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(res?.hits ?? []).map((h) => (
          <li key={h.id} className="rounded-lg border p-3">
            <Link href={`/product/${h.id}`} className="flex gap-3">
              {h.image ? <img src={h.image} alt={h.title} loading="lazy" className="h-20 w-20 flex-none rounded object-contain" /> : <div className="h-20 w-20 flex-none rounded bg-neutral-100" />}
              <div className="min-w-0">
                <div className="line-clamp-2 font-medium">{h.title}</div>
                <div className="mt-1 text-lg font-bold text-teal-700">{formatPkr(h.min_price)}</div>
                <div className="text-xs text-neutral-500">
                  {h.store_count} store{h.store_count === 1 ? '' : 's'}
                  {h.store_count > 1 ? ` · up to ${formatPkr(h.max_price)}` : ` · ${h.offers[0]?.store_name ?? ''}`}
                  {h.price_drop_pct >= 3 ? ` · ↓${h.price_drop_pct}%` : ''}
                  {!h.in_stock_any ? ' · out of stock' : ''}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {res && res.hits.length === 0 && q ? <p className="mt-6 text-neutral-600">Nothing found for “{q}” yet. We add stores every day.</p> : null}
    </div>
  )
}
