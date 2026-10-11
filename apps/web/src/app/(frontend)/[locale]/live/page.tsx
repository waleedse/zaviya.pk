import Link from 'next/link'
import { Radio } from 'lucide-react'
import type { Locale } from '@zaviya/shared'
import { getArticle, getHomeFeed, getLive, getMostRead } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'
import { LiveBadge } from '@/components/article/LiveBadge'
import { TimeAgo } from '@/components/article/TimeAgo'
import { PageHero } from '@/components/layout/PageHero'
import { ListingSidebar } from '@/components/layout/ListingSidebar'
import { formatPktTime } from '@/lib/format'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const d = t(locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'لائیو اپڈیٹس: پاکستان کی تازہ ترین خبریں' : 'Live Updates: Pakistan Breaking News as It Happens',
    description:
      locale === 'ur'
        ? 'پاکستان کی اہم خبروں کی لمحہ بہ لمحہ لائیو اپڈیٹس۔'
        : 'Minute-by-minute live coverage of the biggest stories in Pakistan, updated as they develop.',
    enPath: '/live',
    urPath: '/ur/live',
  })
}

export default async function LivePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale) as Locale
  const d = t(locale)
  const isUr = locale === 'ur'
  const [stories, feed, mostRead] = await Promise.all([getLive(locale), getHomeFeed(locale), getMostRead(locale, 6)])

  const enriched = await Promise.all(
    stories.map(async (card) => {
      const full = await getArticle(locale, card.category.slug, card.slug)
      return { card, updates: full?.updates.slice(0, 4) ?? [] }
    }),
  )
  const liveIds = new Set(stories.map((s) => s.id))
  const river = feed.latest.filter((a) => !liveIds.has(a.id)).slice(0, 30)

  return (
    <div className="pb-8">
      <PageHero
        title={isUr ? 'لائیو اپڈیٹس' : 'Live updates'}
        description={isUr ? 'پاکستان کی اہم خبریں، لمحہ بہ لمحہ۔' : 'The biggest stories in Pakistan, minute by minute, newest first.'}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: d.live }]}
        icon={Radio}
        color="#dc2626"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className="live-dot" aria-hidden /> {enriched.length ? `${enriched.length} ${isUr ? 'لائیو خبریں' : 'live now'}` : isUr ? 'تازہ ترین' : 'Latest'}
          </span>
        }
      />
      <div className="container-wide grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {enriched.map(({ card, updates }) => (
            <article key={card.id} className="rounded-[22px] border border-red-200 bg-surface p-5 md:p-6 dark:border-red-950">
              <div className="flex flex-wrap items-center gap-2.5">
                <LiveBadge locale={locale} />
                <span className="kicker-text" style={{ color: card.category.color }}>
                  {card.category.name}
                </span>
                <span className="text-xs text-fg-subtle">
                  <TimeAgo iso={card.publishedAt} locale={locale} />
                </span>
              </div>
              <Link href={card.href} className="mt-2 block font-display text-[1.6rem] font-extrabold leading-tight hover:text-accent">
                {card.title}
              </Link>
              {card.dek && <p className="mt-2 text-fg-muted">{card.dek}</p>}
              {updates.length > 0 && (
                <ol className="mt-5 space-y-4 border-s-2 border-red-200 ps-5 dark:border-red-950">
                  {updates.map((u, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -start-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-breaking" aria-hidden />
                      <time className="text-xs font-extrabold text-breaking">{formatPktTime(u.at, locale)}</time>
                      <p className="mt-0.5 leading-relaxed">{u.text}</p>
                    </li>
                  ))}
                </ol>
              )}
              <Link href={card.href} className="mt-4 inline-flex text-sm font-bold text-breaking hover:underline">
                {isUr ? 'مکمل لائیو کوریج' : 'Follow the full live coverage'} →
              </Link>
            </article>
          ))}

          {river.length > 0 && (
            <section className="card-surface p-5 md:p-6">
              <h2 className="mb-2 font-display text-2xl font-extrabold">{isUr ? 'تازہ ترین خبریں' : 'Latest from the newsroom'}</h2>
              <ol className="relative border-s-2 border-border ps-5">
                {river.map((a) => (
                  <li key={a.id} className="relative py-3">
                    <span className="absolute -start-[27px] top-[1.15rem] h-3 w-3 rounded-full border-2 border-surface" style={{ background: a.category.color }} aria-hidden />
                    <div className="flex items-center gap-2 text-xs">
                      <TimeAgo iso={a.publishedAt} locale={locale} className="font-extrabold tabular-nums text-fg" />
                      <span className="kicker-text" style={{ color: a.category.color }}>
                        {a.category.name}
                      </span>
                    </div>
                    <Link href={a.href} className="mt-1 block font-display text-[1.1rem] font-bold leading-snug hover:text-accent">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {!enriched.length && !river.length && <p className="card-surface p-10 text-center text-fg-muted">{d.noResults}</p>}
        </div>
        <ListingSidebar locale={locale} mostRead={mostRead} />
      </div>
    </div>
  )
}
