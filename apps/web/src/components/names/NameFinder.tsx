'use client'

import { ArrowRight, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import type { BabyName, NameGender } from '@/lib/baby-names'
import { cn } from '@/lib/utils'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function filterNames(names: BabyName[], q: string, gender: NameGender | 'all', letter: string) {
  const query = q.trim().toLowerCase()
  return names.filter(
    (n) =>
      (gender === 'all' || n.gender === gender) &&
      (!letter || n.name.startsWith(letter)) &&
      (!query || n.name.toLowerCase().includes(query) || n.meaning.toLowerCase().includes(query) || n.ur.includes(q.trim())),
  )
}

export function NameCard({ n, locale, selected, onSelect, children }: { n: BabyName; locale: Locale; selected?: boolean; onSelect?: () => void; children?: React.ReactNode }) {
  const isUr = locale === 'ur'
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', n.gender === 'boy' ? 'bg-blue-600' : 'bg-pink-600')} aria-hidden />
          <b className="font-display text-xl">{n.name}</b>
        </span>
        <span dir="rtl" lang="ur" className="font-urdu-sans text-xl leading-[1.6] text-orange-800 dark:text-orange-300">
          {n.ur}
        </span>
      </span>
      <span className="block text-sm text-fg-muted">{n.meaning}</span>
      <span className="flex items-center gap-2 text-xs text-fg-subtle">
        {n.origin} · {n.gender === 'boy' ? (isUr ? 'لڑکا' : 'Boy') : isUr ? 'لڑکی' : 'Girl'}
        {n.quranic && (
          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {isUr ? 'قرآنی' : 'QURANIC'}
          </span>
        )}
      </span>
    </>
  )
  const cls = cn(
    'flex w-full flex-col gap-1.5 rounded-2xl border-[1.5px] bg-surface p-4 text-start transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]',
    selected ? 'border-orange-500' : 'border-orange-100 dark:border-border',
  )
  if (onSelect) {
    return (
      <div className="relative">
        <button type="button" onClick={onSelect} className={cls} aria-pressed={selected}>
          {body}
        </button>
        {children}
      </div>
    )
  }
  return <div className={cls}>{body}</div>
}

/** Home page baby-name finder: search, boy/girl and A–Z, with instant results. */
export function NameFinder({ locale, names, trending, href }: { locale: Locale; names: BabyName[]; trending: string[]; href: string }) {
  const isUr = locale === 'ur'
  const [q, setQ] = useState('')
  const [gender, setGender] = useState<NameGender | 'all'>('all')
  const [letter, setLetter] = useState('')
  const results = useMemo(() => filterNames(names, q, gender, letter), [names, q, gender, letter])

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2.5">
        <label className="flex h-[52px] min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-2xl border-[1.5px] border-orange-200 bg-surface px-4 focus-within:border-orange-500 dark:border-border">
          <Search className="h-5 w-5 shrink-0 text-orange-700" aria-hidden />
          <span className="sr-only">{isUr ? 'نام یا معنی تلاش کریں' : 'Search a name or meaning'}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isUr ? 'نام یا معنی لکھیں، مثلاً روشنی' : 'Type a name or meaning, e.g. light'}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        <div role="radiogroup" aria-label={isUr ? 'جنس' : 'Gender'} className="inline-flex gap-0.5 rounded-2xl border-[1.5px] border-orange-200 bg-surface p-1 dark:border-border">
          {(
            [
              ['all', isUr ? 'سب' : 'All'],
              ['boy', isUr ? 'لڑکے' : 'Boys'],
              ['girl', isUr ? 'لڑکیاں' : 'Girls'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={gender === key}
              onClick={() => setGender(key)}
              className={cn('h-10 rounded-xl px-4 text-sm font-bold', gender === key ? 'bg-orange-700 text-white' : 'text-orange-900 hover:bg-orange-50 dark:text-orange-200 dark:hover:bg-surface-2')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" dir="ltr">
        {LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={letter === l}
            aria-label={`${isUr ? 'حرف' : 'Starts with'} ${l}`}
            onClick={() => setLetter(letter === l ? '' : l)}
            className={cn(
              'h-9 w-9 rounded-xl border text-sm font-bold transition-colors',
              letter === l ? 'border-orange-700 bg-orange-700 text-white' : 'border-orange-200 bg-surface text-orange-900 hover:border-orange-500 dark:border-border dark:text-orange-200',
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {results.slice(0, 9).map((n) => (
          <NameCard key={n.name} n={n} locale={locale} />
        ))}
        {results.length === 0 && (
          <p className="col-span-full rounded-2xl border border-dashed border-orange-300 bg-surface p-6 text-center text-orange-900 dark:text-orange-200">
            {isUr ? 'کوئی نام نہیں ملا۔ کوئی اور حرف یا معنی آزمائیں۔' : 'No names match yet. Try another letter or meaning.'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-orange-800 dark:text-orange-300">{isUr ? 'ٹرینڈنگ' : 'Trending'}</span>
        {trending.map((name) => (
          <button key={name} type="button" onClick={() => (setQ(name), setLetter(''), setGender('all'))} className="chip min-h-8 border-orange-200 text-[13px] dark:border-border">
            {name}
          </button>
        ))}
        <Link href={href} className="ms-auto inline-flex h-11 items-center gap-2 rounded-2xl bg-orange-700 px-5 text-sm font-bold text-white hover:bg-orange-800">
          {isUr ? `تمام ${names.length} نام دیکھیں` : `Browse all ${names.length} names`}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
