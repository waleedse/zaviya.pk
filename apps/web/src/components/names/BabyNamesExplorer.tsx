'use client'

import { BookOpen, Heart, Map, MoonStar, Search, Sparkles, Star, Type, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { NAME_ORIGINS, type BabyName, type NameGender, type NameOrigin } from '@/lib/baby-names'
import { filterNames, NameCard } from '@/components/names/NameFinder'
import { absoluteUrl } from '@/lib/seo'
import { cn } from '@/lib/utils'

export type Collection = 'quranic' | 'prophets' | 'modern' | 'turkish' | 'regional' | 'short'

const COLLECTIONS: { key: Collection; en: string; ur: string; subEn: string; icon: LucideIcon; tile: string; test: (n: BabyName) => boolean }[] = [
  { key: 'quranic', en: 'Quranic names', ur: 'قرآنی نام', subEn: 'Words from the Quran', icon: BookOpen, tile: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', test: (n) => Boolean(n.quranic) },
  { key: 'prophets', en: 'Prophets’ names', ur: 'انبیاء کے نام', subEn: 'Ibrahim, Musa, Yusuf…', icon: Star, tile: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300', test: (n) => Boolean(n.prophet) },
  { key: 'modern', en: 'Modern & unique', ur: 'جدید نام', subEn: 'Popular with new parents', icon: Sparkles, tile: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300', test: (n) => Boolean(n.trending) },
  { key: 'turkish', en: 'Turkish names', ur: 'ترکی نام', subEn: 'Inspired by dramas', icon: MoonStar, tile: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300', test: (n) => n.origin === 'Turkish' },
  { key: 'regional', en: 'Urdu, Pashto, Sindhi', ur: 'علاقائی نام', subEn: 'Rooted in Pakistan', icon: Map, tile: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', test: (n) => ['Urdu', 'Pashto', 'Sindhi'].includes(n.origin) },
  { key: 'short', en: 'Short names', ur: 'مختصر نام', subEn: 'Four letters or fewer', icon: Type, tile: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300', test: (n) => n.name.length <= 4 },
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const FAV_KEY = 'zv-name-shortlist'
const WA_PATH =
  'M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z'

/** The full /baby-names tool: filters, collections, a detail panel and a shortlist kept in this browser. */
export function BabyNamesExplorer({ locale, names, initialCollection }: { locale: Locale; names: BabyName[]; initialCollection?: Collection }) {
  const isUr = locale === 'ur'
  const [q, setQ] = useState('')
  const [gender, setGender] = useState<NameGender | 'all'>('all')
  const [letter, setLetter] = useState('')
  const [origin, setOrigin] = useState<NameOrigin | 'all'>('all')
  const [collection, setCollection] = useState<Collection | ''>(initialCollection ?? '')
  const [sort, setSort] = useState<'popular' | 'az'>('popular')
  const [selected, setSelected] = useState(names.find((n) => n.trending)?.name ?? names[0]!.name)
  const [favs, setFavs] = useState<string[]>([])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]')
      if (Array.isArray(saved)) setFavs(saved.filter((x) => typeof x === 'string'))
    } catch {}
  }, [])
  const toggleFav = (name: string) => {
    setFavs((cur) => {
      const next = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const results = useMemo(() => {
    const coll = COLLECTIONS.find((c) => c.key === collection)
    let list = filterNames(names, q, gender, letter).filter((n) => (origin === 'all' || n.origin === origin) && (!coll || coll.test(n)))
    if (sort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [names, q, gender, letter, origin, collection, sort])

  const sel = names.find((n) => n.name === selected) ?? names[0]!
  const similar = names.filter((n) => n.gender === sel.gender && n.name !== sel.name && (n.name[0] === sel.name[0] || n.origin === sel.origin)).slice(0, 6)
  const isFav = favs.includes(sel.name)
  const shareText = favs.length
    ? `${isUr ? 'میری پسندیدہ نام' : 'My baby name shortlist'}:\n${favs.map((f) => {
        const n = names.find((x) => x.name === f)
        return n ? `• ${n.name} (${n.ur}): ${n.meaning}` : `• ${f}`
      }).join('\n')}\n\n${absoluteUrl('/baby-names')}`
    : ''
  const coll = COLLECTIONS.find((c) => c.key === collection)
  const genderWord = gender === 'boy' ? (isUr ? 'لڑکوں کے' : 'boy ') : gender === 'girl' ? (isUr ? 'لڑکیوں کے' : 'girl ') : ''
  const title = coll
    ? isUr ? coll.ur : coll.en
    : letter
      ? isUr ? `${letter} سے شروع ہونے والے نام` : `Muslim ${genderWord}names starting with ${letter}`
      : isUr ? 'مقبول اسلامی نام' : `Popular Muslim ${genderWord}names`

  const pill = (on: boolean) =>
    cn('h-9 rounded-full border px-3 text-[13px] font-bold transition-colors', on ? 'border-fg bg-fg text-bg' : 'border-orange-100 bg-surface text-fg-muted hover:text-fg dark:border-border')

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap gap-2.5">
        <label className="flex h-14 min-w-0 flex-[1_1_320px] items-center gap-3 rounded-2xl border-2 border-orange-200 bg-surface px-4 shadow-[0_16px_30px_-22px_rgb(154_52_18/0.6)] focus-within:border-orange-500 dark:border-border">
          <Search className="h-5 w-5 shrink-0 text-orange-700" aria-hidden />
          <span className="sr-only">{isUr ? 'نام یا معنی تلاش کریں' : 'Search a name or a meaning'}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isUr ? 'نام یا معنی تلاش کریں، مثلاً روشنی، شیر، پھول' : 'Search a name or a meaning, e.g. light, lion, flower'}
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none"
          />
        </label>
        <div role="radiogroup" aria-label={isUr ? 'جنس' : 'Gender'} className="inline-flex gap-0.5 rounded-2xl border-2 border-orange-200 bg-surface p-1 dark:border-border">
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
              className={cn('h-11 rounded-xl px-5 text-[15px] font-extrabold', gender === key ? 'bg-orange-600 text-white' : 'text-orange-900 hover:bg-orange-50 dark:text-orange-200 dark:hover:bg-surface-2')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {COLLECTIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={collection === c.key}
            onClick={() => setCollection(collection === c.key ? '' : c.key)}
            className={cn(
              'flex items-center gap-3 rounded-2xl border-[1.5px] p-3.5 text-start transition-colors',
              collection === c.key ? 'border-orange-500 bg-orange-50 dark:bg-surface-2' : 'border-orange-100 bg-surface hover:border-orange-300 dark:border-border',
            )}
          >
            <span className={cn('icon-tile h-10 w-10', c.tile)}>
              <c.icon className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <b className="block text-[15px]">{isUr ? c.ur : c.en}</b>
              {!isUr && <span className="text-xs text-fg-subtle">{c.subEn}</span>}
            </span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_340px]">
        <aside className="space-y-5 rounded-[20px] border border-orange-100 bg-surface p-5 dark:border-border">
          <div>
            <p className="eyebrow mb-2.5 text-orange-800 dark:text-orange-300">{isUr ? 'پہلا حرف' : 'Starts with'}</p>
            <div className="grid grid-cols-7 gap-1.5 lg:grid-cols-5" dir="ltr">
              {LETTERS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={letter === l}
                  aria-label={`${isUr ? 'حرف' : 'Starts with'} ${l}`}
                  onClick={() => setLetter(letter === l ? '' : l)}
                  className={cn(
                    'h-9 rounded-[9px] border text-[13px] font-bold',
                    letter === l ? 'border-orange-600 bg-orange-600 text-white' : 'border-orange-100 text-orange-900 hover:border-orange-400 dark:border-border dark:text-orange-200',
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2.5 text-orange-800 dark:text-orange-300">{isUr ? 'اصل' : 'Origin'}</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setOrigin('all')} className={pill(origin === 'all')} aria-pressed={origin === 'all'}>
                {isUr ? 'سب' : 'All'}
              </button>
              {NAME_ORIGINS.map((o) => (
                <button key={o} type="button" onClick={() => setOrigin(o)} className={pill(origin === o)} aria-pressed={origin === o}>
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2.5 text-orange-800 dark:text-orange-300">{isUr ? 'ترتیب' : 'Sort'}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setSort('popular')} className={pill(sort === 'popular')} aria-pressed={sort === 'popular'}>
                {isUr ? 'مقبول' : 'Popular'}
              </button>
              <button type="button" onClick={() => setSort('az')} className={pill(sort === 'az')} aria-pressed={sort === 'az'}>
                A–Z
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => (setQ(''), setGender('all'), setLetter(''), setOrigin('all'), setCollection(''), setSort('popular'))}
            className="h-11 w-full rounded-xl border-[1.5px] border-dashed border-orange-300 font-bold text-orange-800 dark:text-orange-300"
          >
            {isUr ? 'تمام فلٹر ہٹائیں' : 'Clear all filters'}
          </button>
        </aside>

        <section aria-label={isUr ? 'نتائج' : 'Results'} className="min-w-0">
          <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold">{title}</h2>
            <span className="text-sm text-orange-800 dark:text-orange-300" aria-live="polite">
              {results.length} {isUr ? 'نام' : 'names'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {results.map((n) => (
              <NameCard key={n.name} n={n} locale={locale} selected={n.name === sel.name} onSelect={() => setSelected(n.name)}>
                <button
                  type="button"
                  onClick={() => toggleFav(n.name)}
                  aria-pressed={favs.includes(n.name)}
                  aria-label={`${isUr ? 'پسندیدہ' : 'Shortlist'} ${n.name}`}
                  className={cn(
                    'absolute end-3 bottom-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
                    favs.includes(n.name) ? 'border-orange-300 bg-orange-50 text-orange-600 dark:bg-surface-2' : 'border-orange-100 bg-surface text-fg-subtle hover:text-orange-600 dark:border-border',
                  )}
                >
                  <Heart className={cn('h-[18px] w-[18px]', favs.includes(n.name) && 'fill-current')} aria-hidden />
                </button>
              </NameCard>
            ))}
          </div>
          {results.length === 0 && (
            <p className="rounded-[20px] border-[1.5px] border-dashed border-orange-300 bg-surface p-10 text-center text-orange-900 dark:text-orange-200">
              {isUr ? 'کوئی نام نہیں ملا۔ کوئی اور حرف، اصل یا معنی آزمائیں۔' : 'No names match. Try a different letter, origin or meaning.'}
            </p>
          )}
        </section>

        <aside className="space-y-4 lg:col-span-2 xl:sticky xl:top-40 xl:col-span-1">
          <div className="overflow-hidden rounded-[22px] border border-orange-100 bg-surface dark:border-border">
            <div className={cn('p-6 text-white', sel.gender === 'boy' ? 'bg-blue-800' : 'bg-pink-700')}>
              <div className="flex items-start justify-between gap-3 text-xs font-extrabold uppercase tracking-[0.1em] opacity-90">
                <span>
                  {sel.gender === 'boy' ? (isUr ? 'لڑکے کا نام' : 'Boy name') : isUr ? 'لڑکی کا نام' : 'Girl name'} · {sel.origin}
                </span>
                {sel.quranic && <span className="rounded-md bg-white px-2 py-0.5 text-emerald-700">{isUr ? 'قرآنی' : 'Quranic'}</span>}
              </div>
              <p className="mt-3 font-display text-5xl font-extrabold leading-tight">{sel.name}</p>
              <p lang="ur" dir="rtl" className="text-start font-urdu-sans text-[30px] leading-[1.7]">
                {sel.ur}
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="eyebrow text-fg-subtle">{isUr ? 'معنی' : 'Meaning'}</p>
                <p className="font-display text-[1.35rem] font-bold">{sel.meaning}</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-orange-50 px-3 py-2.5 dark:bg-surface-2">
                  <p className="text-xs text-orange-800 dark:text-orange-300">{isUr ? 'حروف' : 'Letters'}</p>
                  <b>{sel.name.length}</b>
                </div>
                <div className="rounded-xl bg-orange-50 px-3 py-2.5 dark:bg-surface-2">
                  <p className="text-xs text-orange-800 dark:text-orange-300">{isUr ? 'پہلا حرف' : 'Starts with'}</p>
                  <b>{sel.name[0]}</b>
                </div>
              </div>
              {similar.length > 0 && (
                <div>
                  <p className="eyebrow mb-2 text-fg-subtle">{isUr ? 'ملتے جلتے نام' : 'Similar names'}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {similar.map((n) => (
                      <button key={n.name} type="button" onClick={() => setSelected(n.name)} className="chip min-h-8 text-[13px]">
                        {n.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleFav(sel.name)}
                  aria-pressed={isFav}
                  className={cn(
                    'h-12 flex-1 rounded-2xl border-[1.5px] border-orange-600 text-[15px] font-extrabold',
                    isFav ? 'bg-orange-50 text-orange-700 dark:bg-surface-2' : 'bg-orange-600 text-white hover:bg-orange-700',
                  )}
                >
                  {isFav ? (isUr ? 'فہرست میں شامل' : 'In your shortlist') : isUr ? 'فہرست میں شامل کریں' : 'Add to shortlist'}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${sel.name} (${sel.ur}): ${sel.meaning}\n${absoluteUrl('/baby-names')}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={isUr ? 'واٹس ایپ پر شیئر کریں' : 'Share on WhatsApp'}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-whatsapp text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                    <path d={WA_PATH} />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-[22px] bg-ink p-5 text-ink-muted">
            <div className="flex items-center justify-between">
              <b className="font-display text-lg text-white">{isUr ? 'آپ کی فہرست' : 'Your shortlist'}</b>
              <span className="text-sm font-extrabold text-orange-300">{favs.length}</span>
            </div>
            {favs.length === 0 ? (
              <p className="text-sm">{isUr ? 'کسی بھی نام پر دل دبائیں تاکہ وہ یہاں محفوظ ہو جائے۔' : 'Tap the heart on any name to save it here.'}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {favs.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFav(f)}
                    aria-label={`${isUr ? 'ہٹائیں' : 'Remove'} ${f}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ink-line bg-ink-2 pe-2.5 ps-3 text-[13px] font-bold text-white"
                  >
                    {f} <span className="text-ink-muted">×</span>
                  </button>
                ))}
              </div>
            )}
            {favs.length > 0 && (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center justify-center rounded-xl bg-whatsapp text-sm font-extrabold text-white"
              >
                {isUr ? 'فہرست گھر والوں کو بھیجیں' : 'Send shortlist to family'}
              </a>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
