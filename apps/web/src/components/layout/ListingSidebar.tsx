import { Eye } from 'lucide-react'
import Link from 'next/link'
import type { ArticleCard as Card, Locale } from '@zaviya/shared'
import { ArticleCard } from '@/components/article/ArticleCard'
import { AdSlot } from '@/components/ads/AdSlot'
import { SectionHeader } from '@/components/home/SectionHeader'
import { TOOLS } from '@/components/home/tools'
import { NextPrayerCard } from '@/components/namaz/NextPrayerCard'
import { localePath, t } from '@/lib/i18n'
import { todayForAllCities } from '@/lib/prayer-times'
import { cn } from '@/lib/utils'

/** Right rail for section, tag and author pages: next prayer, most read and daily tools. */
export function ListingSidebar({ locale, mostRead }: { locale: Locale; mostRead: Card[] }) {
  const d = t(locale)
  const isUr = locale === 'ur'
  const namaz = todayForAllCities()
  return (
    <aside className="space-y-5 lg:sticky lg:top-40">
      <NextPrayerCard
        locale={locale}
        href={localePath(locale, '/namaz-timings')}
        serverMinutes={namaz.minutes}
        cities={namaz.cities.map((c) => ({ slug: c.city.slug, en: c.city.en, ur: c.city.ur, times: c.times }))}
      />
      {mostRead.length > 0 && (
        <div className="card-surface p-5">
          <SectionHeader title={d.mostRead} icon={Eye} className="mb-1" />
          <div className="divide-y divide-border">
            {mostRead.map((a, i) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="numbered" index={i} />
            ))}
          </div>
        </div>
      )}
      <div className="card-surface p-5">
        <p className="eyebrow mb-3 text-fg-subtle">{isUr ? 'روزمرہ ٹولز' : 'Daily tools'}</p>
        <div className="grid grid-cols-2 gap-2">
          {TOOLS.slice(0, 6).map((tool) => (
            <Link key={tool.path} href={localePath(locale, tool.path)} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-[13px] font-bold hover:text-accent">
              <span className={cn('icon-tile h-8 w-8', tool.tile)}>
                <tool.icon className="h-4 w-4" aria-hidden />
              </span>
              {isUr ? tool.ur : tool.en}
            </Link>
          ))}
        </div>
      </div>
      <AdSlot locale={locale} size="rectangle" />
    </aside>
  )
}
