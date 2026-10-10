import Link from 'next/link'
import { Bell } from 'lucide-react'
import type { Locale } from '@zaviya/shared'
import { getArticle, getLive } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { t } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'
import { Kicker } from '@/components/article/Kicker'
import { LiveBadge } from '@/components/article/LiveBadge'
import { TimeAgo } from '@/components/article/TimeAgo'
import { Button } from '@/components/ui/button'
import { formatPktTime } from '@/lib/format'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const d = t(locale)
  return buildPageMetadata({ locale, title: d.live, path: '/live', urPath: '/ur/live' })
}

export default async function LivePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale) as Locale
  const d = t(locale)
  const stories = await getLive(locale)

  const enriched = await Promise.all(
    stories.map(async (card) => {
      const full = await getArticle(locale, card.category.slug, card.slug)
      return { card, updates: full?.updates.slice(0, 2) ?? [] }
    }),
  )

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-h1 font-semibold">{d.live}</h1>
      <p className="mt-2 text-fg-muted">{d.liveNow}</p>
      <div className="mt-8 space-y-8">
        {enriched.map(({ card, updates }) => (
          <article key={card.id} className="rounded-[var(--radius-card)] border border-border p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Kicker category={card.category} locale={locale} />
                  <LiveBadge locale={locale} />
                </div>
                <Link href={card.href} className="font-display text-h3 font-semibold hover:text-accent">
                  {card.title}
                </Link>
                <p className="text-sm text-fg-muted">
                  <TimeAgo iso={card.publishedAt} locale={locale} />
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0">
                <Bell className="me-1 h-4 w-4" />
                {d.follow}
              </Button>
            </div>
            {updates.length > 0 && (
              <ul className="mt-4 space-y-3 border-s-2 border-breaking/20 ps-4">
                {updates.map((u, i) => (
                  <li key={i}>
                    <time className="text-xs font-medium text-breaking">{formatPktTime(u.at, locale)}</time>
                    <p className="text-sm">{u.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
        {!enriched.length && <p className="text-fg-muted">{d.noResults}</p>}
      </div>
    </div>
  )
}
