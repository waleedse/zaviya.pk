'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { formatPkr } from '@zaviya/shared'
import type { DealCard } from '@/lib/search/hub'

export interface BarCategory {
  name: string
  href: string
  count: number
  image: string | null
  subs: { name: string; href: string; count: number; leaves: { name: string; href: string }[] }[]
  deal: { id: string; title: string; price: number; was: number | null } | null
}

/** The category bar under the header: each top category opens a mega menu of sub-categories and the levels below, plus its best offer */
export function CategoryBar({ cats }: { cats: BarCategory[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(null)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [])
  const cur = open != null ? cats[open] : null
  return (
    <div ref={box} className="relative border-b border-border bg-surface">
      <nav aria-label="Categories" className="container-wide flex gap-0.5 overflow-x-auto md:flex-wrap md:overflow-visible">
        {cats.map((c, i) => (
          <button key={c.href} type="button" aria-expanded={open === i} aria-haspopup="true" onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => window.matchMedia('(hover: hover)').matches && setOpen(i)} className={`flex h-12 flex-none items-center gap-1.5 whitespace-nowrap px-3.5 text-sm font-semibold ${open === i ? 'text-accent shadow-[inset_0_-3px_0_var(--accent)]' : 'text-fg'}`}>
            {c.name} <span aria-hidden="true" className="text-[10px] text-fg-subtle">▾</span>
          </button>
        ))}
        <Link href="/prices/on-sale" className="flex h-12 flex-none items-center gap-1.5 whitespace-nowrap px-3.5 text-sm font-extrabold text-breaking">
          On sale <span className="rounded-md bg-breaking px-1.5 py-0.5 text-[11px] text-white">HOT</span>
        </Link>
      </nav>
      {cur ? (
        <div role="region" aria-label={`${cur.name} menu`} className="absolute inset-x-0 top-full z-30 border-b border-border bg-surface shadow-2xl" onMouseLeave={() => window.matchMedia('(hover: hover)').matches && setOpen(null)}>
          <div className="container-wide grid gap-6 py-6 md:grid-cols-12">
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 md:col-span-9 md:grid-cols-3">
              {cur.subs.map((s) => (
                <div key={s.href} className="flex flex-col gap-1.5">
                  <Link href={s.href} onClick={() => setOpen(null)} className="text-[15px] font-bold hover:text-accent">{s.name} <span className="text-[13px] font-medium text-fg-muted">{s.count.toLocaleString('en-US')}</span></Link>
                  {s.leaves.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(null)} className="text-sm text-fg-muted hover:text-accent">{l.name}</Link>)}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-4 md:col-span-3">
              {cur.image ? <img src={cur.image} alt="" loading="lazy" className="h-28 w-full rounded-xl bg-white object-contain" /> : null}
              {cur.deal ? (
                <>
                  <span className="text-[13px] font-bold text-breaking">Best offer in {cur.name}</span>
                  <Link href={`/product/${cur.deal.id}`} onClick={() => setOpen(null)} className="line-clamp-2 text-[15px] font-semibold hover:text-accent">{cur.deal.title}</Link>
                  <span className="text-xl font-extrabold text-accent">{formatPkr(cur.deal.price)} {cur.deal.was ? <s className="text-[13px] font-medium text-fg-muted">{formatPkr(cur.deal.was)}</s> : null}</span>
                </>
              ) : null}
              <Link href={cur.href} onClick={() => setOpen(null)} className="text-sm font-bold text-accent">All of {cur.name} →</Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface Hit { id: string; title: string; image: string | null; min_price: number; store_count: number; in_stock_any: boolean; offers: { store_name: string; in_stock: boolean; price: number }[]; category_path?: string[] }
interface Res { hits: Hit[]; total: number; facets?: Record<string, Record<string, number>>; note?: { kind: string } | null }

/** The big search box: type and a dropdown of products appears at once (the same /api/search the products page uses) */
export function HeroSearch({ catLinks }: { catLinks: Record<string, string> }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Res | null>(null)
  const [focus, setFocus] = useState(false)
  const seq = useRef(0)
  const box = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (q.trim().length < 2) return setRes(null)
    const n = ++seq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?${new URLSearchParams({ q, limit: '6' })}`)
        const j = (await r.json()) as Res
        if (n === seq.current) setRes(j)
      } catch {}
    }, 90)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => {
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setFocus(false)
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [])
  const show = focus && q.trim().length >= 2 && res
  const cats = Object.entries(res?.facets?.category_path ?? {}).filter(([c]) => c.includes(' > ')).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return (
    <form ref={box} action="/products" role="search" className="relative w-full" onSubmit={(e) => { if (q.trim().length < 2) e.preventDefault() }}>
      <label htmlFor="hub-q" className="sr-only">Search any product</label>
      <div className={`flex h-[62px] items-center gap-3 border border-border bg-surface pl-5 pr-2 shadow-lg ${show ? 'rounded-t-[28px]' : 'rounded-full'}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="flex-none text-fg-subtle"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input id="hub-q" name="q" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} placeholder="Try airpods, redmi note 14, atta 20 kg, split AC…" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[17px] outline-none md:text-lg" />
        <button type="submit" className="h-12 flex-none rounded-full bg-accent px-6 text-base font-bold text-accent-fg">Search</button>
      </div>
      {show ? (
        <div className="absolute inset-x-0 top-[62px] z-20 overflow-hidden rounded-b-[28px] border border-t-0 border-border bg-surface pb-3 text-left shadow-2xl">
          {res!.hits.length ? (
            <ul>
              {res!.hits.map((h) => {
                const live = h.offers.filter((o) => o.in_stock)
                const bestStore = (live.length ? [...live] : [...h.offers]).sort((a, b) => a.price - b.price)[0]
                return (
                  <li key={h.id}>
                    <Link href={`/product/${h.id}`} className="flex items-center gap-3.5 px-5 py-2.5 hover:bg-surface-2">
                      <span className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-xl bg-white">{h.image ? <img src={h.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium">{h.title}</span><span className="block text-xs text-fg-muted">{bestStore ? `Cheapest at ${bestStore.store_name}` : ''} · {h.store_count} store{h.store_count === 1 ? '' : 's'}{h.in_stock_any ? '' : ' · out of stock'}</span></span>
                      <span className="text-base font-extrabold text-accent">{formatPkr(h.min_price)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-fg-muted">{res!.note?.kind === 'none' ? 'No product matches every word. Try fewer words.' : 'Nothing found yet. We add stores every day.'}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border px-5 pt-3">
            {cats.length ? <span className="text-xs text-fg-muted">In categories:</span> : null}
            {cats.map(([c]) => catLinks[c] ? <Link key={c} href={catLinks[c]} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px]">{c.split(' > ').at(-1)}</Link> : null)}
            <Link href={`/products?q=${encodeURIComponent(q)}`} className="ml-auto text-sm font-bold text-accent">See all {res!.total.toLocaleString('en-US')} results →</Link>
          </div>
        </div>
      ) : null}
    </form>
  )
}

/** "Best offers right now": tabs by price band, each with real discounts against the store's own list price */
export function OfferTabs({ bands }: { bands: { key: string; label: string; deals: DealCard[] }[] }) {
  const firstWithDeals = Math.max(0, bands.findIndex((b) => b.deals.length))
  const [i, setI] = useState(firstWithDeals)
  const cur = bands[i]!
  return (
    <section aria-labelledby="deals-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="deals-h" className="font-display text-2xl font-extrabold md:text-3xl">Best offers right now</h2>
          <p className="text-sm text-fg-muted">Real cuts against the store's own crossed-out price · in stock today</p>
        </div>
        <div role="tablist" aria-label="Price range" className="flex flex-wrap gap-1.5 rounded-full bg-surface-2 p-1">
          {bands.map((b, n) => (
            <button key={b.key} type="button" role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`h-10 rounded-full px-4 text-[13px] font-bold ${n === i ? 'bg-surface text-fg shadow' : 'text-fg-muted'}`}>{b.label}</button>
          ))}
        </div>
      </div>
      {cur.deals.length ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cur.deals.map((d) => (
            <Link key={d.id} href={`/product/${d.id}`} className="card-surface flex flex-col gap-2 p-3">
              <span className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-white">
                {d.image ? <img src={d.image} alt={d.title} loading="lazy" className="h-full w-full object-contain" /> : null}
                <span className="absolute left-2 top-2 rounded-lg bg-breaking px-2 py-1 text-[13px] font-extrabold text-white">−{d.offPct}%</span>
              </span>
              <span className="line-clamp-2 min-h-[2.6rem] text-[15px] leading-snug">{d.title}</span>
              <span className="flex flex-wrap items-baseline gap-2"><span className="text-[1.3rem] font-extrabold text-accent">{formatPkr(d.price)}</span>{d.listPrice ? <s className="text-[13px] text-fg-subtle">{formatPkr(d.listPrice)}</s> : null}</span>
              <span className="text-[13px] text-fg-muted">{d.store} · {d.stores} stores</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="card-surface p-6 text-fg-muted">No real discounts in this range today. Try another range, or see <Link href="/prices/on-sale" className="font-semibold text-accent">all offers</Link>.</p>
      )}
      <Link href="/prices/on-sale" className="text-sm font-bold text-accent">See every offer →</Link>
    </section>
  )
}
