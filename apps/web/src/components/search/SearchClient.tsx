'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ArticleCard, Locale } from '@zaviya/shared'
import { DATA_PAGES } from '@zaviya/shared'
import Link from 'next/link'
import { ArticleCard as Card } from '@/components/article/ArticleCard'
import { EmptyState } from '@/components/layout/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { localePath, t } from '@/lib/i18n'

const STORAGE_KEY = 'zaviya-recent-searches'

export function SearchClient({
  locale,
  initialQuery,
  results,
}: {
  locale: Locale
  initialQuery: string
  results: ArticleCard[]
}) {
  const d = t(locale)
  const router = useRouter()
  const [q, setQ] = useState(initialQuery)
  const [recent, setRecent] = useState<string[]>([])

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
      if (trimmed) {
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
    }, 250)
    return () => clearTimeout(id)
  }, [q, router, locale, initialQuery])

  const rateHits = useMemo(() => {
    const needle = initialQuery.toLowerCase()
    if (!needle) return []
    return DATA_PAGES.filter((p) => p.slug.includes(needle) || p.en.toLowerCase().includes(needle))
  }, [initialQuery])

  const highlight = (text: string) => {
    if (!initialQuery) return text
    const i = text.toLowerCase().indexOf(initialQuery.toLowerCase())
    if (i < 0) return text
    return (
      <>
        {text.slice(0, i)}
        <mark className="bg-accent/20">{text.slice(i, i + initialQuery.length)}</mark>
        {text.slice(i + initialQuery.length)}
      </>
    )
  }

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-h1 font-semibold">{d.search}</h1>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={d.searchPlaceholder}
        className="mt-6 h-12 w-full rounded-[var(--radius-input)] border border-border bg-surface px-4 text-base outline-none focus:border-accent"
      />
      {recent.length > 0 && !initialQuery && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-sm text-fg-muted">{d.recentSearches}:</span>
          {recent.map((r) => (
            <button key={r} type="button" onClick={() => setQ(r)} className="rounded-[var(--radius-pill)] bg-surface-2 px-3 py-1 text-sm">
              {r}
            </button>
          ))}
        </div>
      )}
      <Tabs defaultValue="all" className="mt-8">
        <TabsList>
          <TabsTrigger value="all">{d.tabs.all}</TabsTrigger>
          <TabsTrigger value="news">{d.tabs.news}</TabsTrigger>
          <TabsTrigger value="rates">{d.tabs.rates}</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          {initialQuery && results.length === 0 && rateHits.length === 0 && (
            <EmptyState title={d.noResults} description={d.tryDifferent} />
          )}
          <div className="space-y-4">
            {results.map((a) => (
              <div key={a.id}>
                <Card article={a} locale={locale} variant="list" />
                {a.dek && <p className="ps-20 text-sm text-fg-muted line-clamp-1">{highlight(a.dek)}</p>}
              </div>
            ))}
            {rateHits.map((p) => (
              <Link key={p.key} href={localePath(locale, `/${p.slug}`)} className="block rounded-md border border-border p-4 hover:border-accent/40">
                {highlight(locale === 'ur' ? p.ur : p.en)}
              </Link>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="news">
          {results.map((a) => (
            <Card key={a.id} article={a} locale={locale} variant="list" />
          ))}
        </TabsContent>
        <TabsContent value="rates">
          {rateHits.map((p) => (
            <Link key={p.key} href={localePath(locale, `/${p.slug}`)} className="block py-3 text-accent">
              {locale === 'ur' ? p.ur : p.en}
            </Link>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
