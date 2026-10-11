'use client'

import { MapPin } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import type { Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'

/** Filterable list of city links; each city has its own SEO page. */
export function CityPicker({ locale, cities, current }: { locale: Locale; cities: { slug: string; en: string; ur: string; href: string }[]; current: string }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const list = cities.filter((c) => !query || c.en.toLowerCase().includes(query) || c.ur.includes(q.trim()))
  const isUr = locale === 'ur'
  return (
    <div className="max-w-[560px]">
      <label className="flex h-14 items-center gap-3 rounded-2xl bg-white px-4 text-[#0b1220] shadow-[0_16px_30px_-20px_rgb(0_0_0/0.6)]">
        <MapPin className="h-5 w-5 text-emerald-700" aria-hidden />
        <span className="sr-only">{isUr ? 'اپنا شہر تلاش کریں' : 'Find your city'}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isUr ? 'اپنا شہر تلاش کریں…' : 'Search your city…'}
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {list.map((c) => (
          <Link
            key={c.slug}
            href={c.href}
            aria-current={c.slug === current ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-bold transition-colors',
              c.slug === current ? 'border-amber-400 bg-amber-400 text-[#0b1220]' : 'border-emerald-800 text-emerald-50 hover:border-emerald-400',
            )}
          >
            {isUr ? c.ur : c.en}
          </Link>
        ))}
        {list.length === 0 && <p className="text-sm text-emerald-200">{isUr ? 'یہ شہر ابھی فہرست میں نہیں۔' : 'That city is not on the list yet.'}</p>}
      </div>
    </div>
  )
}
