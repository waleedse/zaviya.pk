'use client'

import { ArrowRight, Newspaper, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * "Search any price": the box on /prices, the home page and in the header search. Suggestions come from
 * /api/prices/search as you type (item, brand, category, latest price). It never opens a results page: that keeps
 * thin pages out of Google. A search that finds nothing shows the closest categories and is logged for us.
 */

interface Hit {
  n: string
  h: string
  b?: string
  c?: string
  p?: number | null
  u?: string | null
  k?: string
  count?: number
  min?: number | null
}
interface Resp {
  q: string
  total: number
  fuzzy: boolean
  items: Hit[]
  categories: Hit[]
  pages: { href: string; name: string }[]
  closest: Hit[]
}
type Row = { key: string; href: string; title: string; sub: string; price?: string; cat?: boolean }

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`

const COPY = {
  en: {
    placeholder: 'Search any price: atta, anda, honda 70…',
    label: 'Search any price',
    try: 'Try',
    none: 'No price found for',
    noneHelp: 'We have noted your search and will add it. Browse the closest categories:',
    didYou: 'Showing close matches',
    category: 'category',
    models: 'items',
    from: 'from',
    news: 'Search news for',
    clear: 'Clear',
  },
  ur: {
    placeholder: 'کوئی بھی قیمت تلاش کریں: آٹا، انڈے، ہونڈا 70، فریج…',
    label: 'کوئی بھی قیمت تلاش کریں',
    try: 'مثلاً',
    none: 'کوئی قیمت نہیں ملی:',
    noneHelp: 'ہم نے آپ کی تلاش نوٹ کر لی ہے اور جلد شامل کریں گے۔ قریب ترین زمرے دیکھیں:',
    didYou: 'ملتے جلتے نتائج',
    category: 'زمرہ',
    models: 'اشیا',
    from: 'سے',
    news: 'خبروں میں تلاش کریں',
    clear: 'صاف کریں',
  },
} as const

const TRY = [
  { en: 'atta', q: 'atta' },
  { en: 'anda', q: 'anda' },
  { en: 'honda 70', q: 'honda 70' },
  { en: 'cheeni', q: 'cheeni' },
  { en: 'fridge', q: 'fridge' },
  { en: 'gari', q: 'car' },
  { en: 'LPG', q: 'lpg' },
]

export function PriceSearch({
  locale = 'en',
  variant = 'hero',
  inline = false,
  autoFocus = false,
  newsHref,
  onNavigate,
  onQueryChange,
  className,
}: {
  locale?: 'en' | 'ur'
  variant?: 'hero' | 'dialog'
  /** results sit in the page flow (a dialog) instead of floating under the box */
  inline?: boolean
  autoFocus?: boolean
  /** shows "Search news for ..." when set */
  newsHref?: string
  onNavigate?: () => void
  onQueryChange?: (q: string) => void
  className?: string
}) {
  const c = COPY[locale]
  const router = useRouter()
  const id = useId()
  const [q, setQ] = useState('')
  const [resp, setResp] = useState<Resp | null>(null)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(-1)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const logged = useRef(new Set<string>())
  const seq = useRef(0)

  useEffect(() => {
    onQueryChange?.(q)
    const term = q.trim()
    if (term.length < 2) {
      setResp(null)
      setBusy(false)
      return
    }
    const mine = ++seq.current
    setBusy(true)
    const ctl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/prices/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as Resp
        if (mine !== seq.current) return
        setResp(data)
        setActive(-1)
        setBusy(false)
        // nothing found: tell the site once per phrase, after the visitor stops typing
        if (data.total === 0 && !data.categories.length && !data.pages.length && term.length >= 3 && !logged.current.has(term.toLowerCase())) {
          logged.current.add(term.toLowerCase())
          setTimeout(() => {
            if (mine === seq.current) void fetch('/api/prices/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: term }), keepalive: true }).catch(() => {})
          }, 800)
        }
      } catch {
        if (mine === seq.current) setBusy(false)
      }
    }, 130)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    if (inline) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [inline])

  const rows: Row[] = resp
    ? [
        ...resp.categories.map((x) => ({ key: `c${x.h}`, href: x.h, title: x.n, sub: `${x.count} ${c.models}${x.min ? ` · ${c.from} ${rs(x.min)}` : ''}`, cat: true })),
        ...resp.items.map((x) => ({ key: x.h, href: x.h, title: x.n, sub: [x.b && x.k !== 'source' ? x.b : null, x.c, x.u].filter(Boolean).join(' · '), price: x.p ? rs(x.p) : undefined })),
        ...resp.pages.map((x) => ({ key: `p${x.href}`, href: x.href, title: x.name, sub: '', cat: true })),
      ]
    : []
  const none = !!resp && rows.length === 0 && q.trim().length >= 2
  const showList = (inline || open) && q.trim().length >= 2 && !!resp

  const go = (href: string) => {
    router.push(href)
    setOpen(false)
    onNavigate?.()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(rows.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(-1, a - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = rows[active] ?? rows.find((r) => !r.cat) ?? rows[0]
      if (pick) go(pick.href)
    }
  }

  const big = variant === 'hero'
  const list = showList ? (
    <div
      id={`${id}-list`}
      role="listbox"
      aria-label={c.label}
      className={cn(inline ? 'p-3' : 'absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-[var(--shadow-lift)]')}
    >
      {resp?.fuzzy && rows.length > 0 ? <p className="px-3 pb-1 pt-1 text-xs font-semibold text-fg-subtle">{c.didYou}</p> : null}
      {rows.map((r, i) => (
        <Link
          key={r.key}
          id={`${id}-o${i}`}
          role="option"
          aria-selected={i === active}
          href={r.href}
          onClick={() => {
            setOpen(false)
            onNavigate?.()
          }}
          onMouseEnter={() => setActive(i)}
          className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', i === active ? 'bg-accent-soft' : 'hover:bg-surface-2')}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{r.title}</span>
            {r.sub ? <span className="block truncate text-xs text-fg-muted">{r.cat ? `${c.category} · ${r.sub}` : r.sub}</span> : null}
          </span>
          {r.price ? <span className="shrink-0 font-display font-bold tabular-nums">{r.price}</span> : <ArrowRight className="h-4 w-4 shrink-0 text-fg-subtle rtl:rotate-180" aria-hidden />}
        </Link>
      ))}
      {none ? (
        <div className="px-3 py-3">
          <p className="font-semibold">
            {c.none} “{q.trim()}”
          </p>
          <p className="mt-1 text-sm text-fg-muted">{c.noneHelp}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(resp?.closest ?? []).map((x) => (
              <Link key={x.h} href={x.h} onClick={() => onNavigate?.()} className="chip">
                {x.n}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {newsHref ? (
        <Link href={`${newsHref}?q=${encodeURIComponent(q.trim())}`} onClick={() => onNavigate?.()} className="mt-1 flex items-center gap-2 border-t border-border px-3 py-2.5 text-sm font-semibold text-fg-muted hover:text-accent">
          <Newspaper className="h-4 w-4" aria-hidden />
          {c.news} “{q.trim()}”
        </Link>
      ) : null}
    </div>
  ) : null

  return (
    <div ref={box} className={cn('relative', className)} dir={locale === 'ur' ? 'rtl' : undefined}>
      <div
        className={cn(
          'flex items-center gap-3 border-[1.5px] border-border bg-surface transition-colors focus-within:border-accent',
          big ? 'h-14 rounded-2xl px-4 shadow-[var(--shadow-card)] md:h-16 md:px-5' : 'h-16 rounded-none border-0 border-b ps-5 pe-12',
        )}
      >
        <Search className={cn('shrink-0 text-accent', big ? 'h-6 w-6' : 'h-5 w-5')} aria-hidden />
        <label htmlFor={id} className="sr-only">
          {c.label}
        </label>
        <input
          id={id}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={c.placeholder}
          className={cn('min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle [&::-webkit-search-cancel-button]:hidden', big ? 'text-base md:text-lg' : 'text-lg')}
        />
        {busy ? <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden /> : null}
        {q && big ? (
          <button type="button" aria-label={c.clear} onClick={() => { setQ(''); setResp(null) }} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {list}
      {big && !q ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span>{c.try}:</span>
          {TRY.map((t) => (
            <button key={t.en} type="button" onClick={() => { setQ(t.q); setOpen(true) }} className="chip min-h-8 text-[13px]">
              {t.en}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  )
}
