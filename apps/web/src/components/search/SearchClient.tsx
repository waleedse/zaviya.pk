'use client'

import { ArrowRight, Baby, Clock, MoonStar, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleCard, Locale } from '@zaviya/shared'
import Link from 'next/link'
import { ArticleCard as Card } from '@/components/article/ArticleCard'
import { EmptyState } from '@/components/layout/EmptyState'
import { TOOLS } from '@/components/home/tools'
import { NameCard } from '@/components/names/NameFinder'
import { BABY_NAMES, trendingNames } from '@/lib/baby-names'
import { PK_CITIES } from '@/lib/prayer-times'
import { localePath, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'zaviya-recent-searches'

/** Extra words that should find each tool. */
const TOOL_KEYWORDS: Record<string, string[]> = {
  '/namaz-timings': ['namaz', 'prayer', 'salah', 'salat', 'fajr', 'zuhr', 'dhuhr', 'asr', 'maghrib', 'isha', 'azan', 'نماز', 'iftar', 'sehri'],
  '/gold-rate-today-pakistan': ['gold', 'sona', 'tola', 'سونا', 'silver'],
  '/dollar-rate-today-pakistan': ['dollar', 'usd', 'exchange', 'rupee', 'currency', 'ڈالر'],
  '/petrol-price-today-pakistan': ['petrol', 'diesel', 'fuel', 'پیٹرول'],
  '/baby-names': ['name', 'names', 'baby', 'naam', 'نام', 'boy', 'girl'],
  '/namaz-timings#islamic-dates': ['islamic', 'hijri', 'calendar', 'ramadan', 'eid', 'shab'],
  '/namaz-timings#qibla': ['qibla', 'kibla', 'قبلہ'],
  '/live': ['live', 'breaking'],
}

export function SearchClient({ locale, initialQuery, results }: { locale: Locale; initialQuery: string; results: ArticleCard[] }) {
  const d = t(locale)
  const isUr = locale === 'ur'
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [recent, setRecent] = useState<string[]>([])
  const [tab, setTab] = useState<'all' | 'news' | 'tools' | 'names'>('all')

  useEffect(() => setQ(initialQuery), [initialQuery])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setRecent(JSON.parse(raw) as string[])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const id = setTimeout(() => {
      const trimmed = q.trim()
      const base = localePath(locale, '/search')
      const url = trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base
      if (trimmed !== initialQuery.trim()) router.replace(url)
      if (trimmed.length > 1) {
        try {
          setRecent((prev) => {
            const next = [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, 8)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            return next
          })
        } catch {
          /* ignore */
        }
      }
    }, 300)
    return () => clearTimeout(id)
  }, [q, router, locale, initialQuery])

  // Names and tools are matched instantly in the browser; news comes from the server.
  const needle = q.trim().toLowerCase()
  const words = useMemo(() => needle.split(/\s+/).filter(Boolean), [needle])
  const toolHits = useMemo(() => {
    if (!needle) return []
    return TOOLS.filter((tool) => {
      const hay = [tool.en, tool.ur, tool.subEn, ...(TOOL_KEYWORDS[tool.path] ?? [])].join(' ').toLowerCase()
      return words.some((w) => w.length > 2 && hay.includes(w))
    })
  }, [needle, words])
  const cityHits = useMemo(() => (needle ? PK_CITIES.filter((c) => words.some((w) => w.length > 2 && (c.en.toLowerCase().startsWith(w) || c.ur === w))) : []), [needle, words])
  const nameHits = useMemo(() => {
    if (!needle) return []
    const wantsNames = /\b(names?|naam|baby)\b|نام/.test(needle)
    const gender = /\bgirls?\b|لڑکی/.test(needle) ? 'girl' : /\bboys?\b|لڑک/.test(needle) ? 'boy' : null
    const direct = BABY_NAMES.filter((n) => words.some((w) => w.length > 1 && (n.name.toLowerCase().startsWith(w) || n.ur.includes(w) || (w.length > 3 && n.meaning.toLowerCase().includes(w)))))
    const list = direct.length ? direct : wantsNames ? BABY_NAMES : []
    return list.filter((n) => !gender || n.gender === gender).slice(0, 9)
  }, [needle, words])

  const highlight = (text: string) => {
    if (!initialQuery) return text
    const i = text.toLowerCase().indexOf(initialQuery.toLowerCase())
    if (i < 0) return text
    return (
      <>
        {text.slice(0, i)}
        <mark className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">{text.slice(i, i + initialQuery.length)}</mark>
        {text.slice(i + initialQuery.length)}
      </>
    )
  }

  const nothing = needle && results.length === 0 && toolHits.length === 0 && nameHits.length === 0 && cityHits.length === 0
  const tabs = [
    ['all', isUr ? 'سب' : 'All', results.length + toolHits.length + nameHits.length + cityHits.length],
    ['news', isUr ? 'خبریں' : 'News', results.length],
    ['tools', isUr ? 'ٹولز' : 'Tools', toolHits.length + cityHits.length],
    ['names', isUr ? 'نام' : 'Names', nameHits.length],
  ] as const

  const toolsBlock = (toolHits.length > 0 || cityHits.length > 0) && (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-extrabold">{isUr ? 'ٹولز' : 'Tools'}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cityHits.map((c) => (
          <Link key={c.slug} href={localePath(locale, c.slug === PK_CITIES[0]!.slug ? '/namaz-timings' : `/namaz-timings/${c.slug}`)} className="card-lift flex items-center gap-3 p-4">
            <span className="icon-tile h-11 w-11 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <MoonStar className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <b className="block">{isUr ? `${c.ur} میں نماز کے اوقات` : `Namaz timings in ${c.en}`}</b>
              <span className="text-[13px] text-fg-subtle">{isUr ? 'آج کے اوقات اور قبلہ' : 'Today’s times & Qibla'}</span>
            </span>
          </Link>
        ))}
        {toolHits.map((tool) => (
          <Link key={tool.path} href={localePath(locale, tool.path)} className="card-lift flex items-center gap-3 p-4">
            <span className={cn('icon-tile h-11 w-11', tool.tile)}>
              <tool.icon className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <b className="block">{isUr ? tool.ur : tool.en}</b>
              <span className="text-[13px] text-fg-subtle">{isUr ? tool.subUr : tool.subEn}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )

  const namesBlock = nameHits.length > 0 && (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Baby className="h-5 w-5 text-orange-700" aria-hidden />
          {isUr ? 'بچوں کے نام' : 'Baby names'}
        </h2>
        <Link href={localePath(locale, '/baby-names')} className="inline-flex items-center gap-1 text-sm font-bold text-orange-700 hover:underline">
          {isUr ? 'تمام نام' : 'All names'} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nameHits.map((n) => (
          <NameCard key={n.name} n={n} locale={locale} />
        ))}
      </div>
    </section>
  )

  const newsBlock = results.length > 0 && (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-extrabold">{isUr ? 'خبریں' : 'News'}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {results.map((a) => (
          <div key={a.id} className="space-y-1">
            <Card article={a} locale={locale} variant="side" />
            {a.dek && <p className="px-3 text-sm text-fg-muted line-clamp-2">{highlight(a.dek)}</p>}
          </div>
        ))}
      </div>
    </section>
  )

  return (
    <div className="pb-10">
      <section className="border-b border-border bg-accent-soft py-8 md:py-10">
        <div className="container-wide">
          <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3rem)] font-extrabold">{d.search}</h1>
          <label className="mt-5 flex h-16 items-center gap-3 rounded-2xl border-2 border-accent-line bg-surface px-5 shadow-[var(--shadow-card)] focus-within:border-accent">
            <Search className="h-6 w-6 shrink-0 text-accent" aria-hidden />
            <span className="sr-only">{d.search}</span>
            <input
              type="search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isUr ? 'خبریں، بچوں کے نام، نماز کے اوقات، سونے کا ریٹ…' : 'Search news, baby names, namaz timings, gold rate…'}
              className="h-full min-w-0 flex-1 bg-transparent text-lg outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label={isUr ? 'صاف کریں' : 'Clear'} className="rounded-lg p-1.5 text-fg-subtle hover:text-fg">
                <X className="h-5 w-5" />
              </button>
            )}
          </label>
          {!needle && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {recent.length > 0 ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
                    <Clock className="h-4 w-4" aria-hidden />
                    {d.recentSearches}
                  </span>
                  {recent.map((r) => (
                    <button key={r} type="button" onClick={() => setQ(r)} className="chip min-h-8 text-[13px]">
                      {r}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <span className="text-sm font-semibold text-fg-muted">{isUr ? 'آزمائیں' : 'Try'}</span>
                  {['Gold rate', 'Namaz Lahore', 'Girl names', trendingNames(1)[0]?.name ?? 'Ayaan', 'Petrol price'].map((s) => (
                    <button key={s} type="button" onClick={() => setQ(s)} className="chip min-h-8 text-[13px]">
                      {s}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="container-wide pt-6">
        {needle && (
          <div role="tablist" className="no-scrollbar mb-6 flex gap-2 overflow-x-auto">
            {tabs.map(([key, label, count]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn('inline-flex h-10 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-bold', tab === key ? 'border-fg bg-fg text-bg' : 'border-border bg-surface text-fg-muted')}
              >
                {label}
                <span className={cn('rounded-full px-1.5 text-xs', tab === key ? 'bg-bg/20' : 'bg-surface-2')}>{count}</span>
              </button>
            ))}
          </div>
        )}
        {nothing && <EmptyState title={d.noResults} description={d.tryDifferent} />}
        <div className="space-y-10">
          {(tab === 'all' || tab === 'tools') && toolsBlock}
          {(tab === 'all' || tab === 'names') && namesBlock}
          {(tab === 'all' || tab === 'news') && newsBlock}
        </div>
      </div>
    </div>
  )
}
