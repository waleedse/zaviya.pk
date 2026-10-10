import Link from 'next/link'
import { SITE, type Locale } from '@zaviya/shared'
import { ArticleCard } from '@/components/article/ArticleCard'
import { RateCard } from '@/components/data/RateCard'
import { AdSlot } from '@/components/ads/AdSlot'
import { HomeLatest } from '@/components/home/HomeLatest'
import { NewsletterCTA } from '@/components/marketing/NewsletterCTA'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { getHomeFeed, getRatesTicker } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const title = locale === 'ur' ? SITE.nameUr : SITE.name
  return buildPageMetadata({
    locale,
    title,
    description: locale === 'ur' ? SITE.taglineUr : SITE.tagline,
    path: locale === 'ur' ? '/ur' : '/',
  })
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale) as Locale
  const d = t(locale)
  const [feed, rates] = await Promise.all([getHomeFeed(locale), getRatesTicker()])

  return (
    <div className="container-page space-y-12 py-8 md:py-12">
      <section className="grid gap-8 lg:grid-cols-12">
        {feed.hero && <ArticleCard article={feed.hero} locale={locale} variant="hero" priority />}
        <div className="flex flex-col gap-6 lg:col-span-4">
          {feed.secondary.map((a) => (
            <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
          ))}
        </div>
      </section>

      <AdSlot locale={locale} size="leaderboard" />

      {feed.live.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-h2 font-semibold">{d.liveNow}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {feed.live.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="large" />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <h2 className="mb-4 font-display text-h2 font-semibold">{d.latest}</h2>
          <HomeLatest locale={locale} initial={feed.latest} />
        </div>
        <aside className="space-y-6 lg:col-span-4">
          <h2 className="font-display text-h2 font-semibold">{d.nav.rates}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {rates.map((r) => (
              <RateCard key={r.series} rate={r} locale={locale} />
            ))}
          </div>
          <AdSlot locale={locale} size="skyscraper" className="sticky top-32 hidden lg:flex" />
        </aside>
      </section>

      {feed.rails.map((rail) => (
        <section key={rail.category.slug}>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="font-display text-h2 font-semibold" style={{ borderTop: `3px solid ${rail.category.color}`, paddingTop: 8 }}>
              {rail.category.name}
            </h2>
            <Link href={localePath(locale, `/${rail.category.slug}`)} className="text-sm font-medium text-accent">
              {d.seeAll} →
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x md:grid md:grid-cols-4 md:overflow-visible">
            {rail.articles.map((a, i) => (
              <div key={a.id} className="min-w-[280px] snap-start md:min-w-0">
                <ArticleCard article={a} locale={locale} variant={i === 0 ? 'large' : 'medium'} />
              </div>
            ))}
          </div>
          <AdSlot locale={locale} size="native" className="md:hidden" />
        </section>
      ))}

      {feed.explainers.length > 0 && (
        <section className="rounded-[var(--radius-card)] bg-accent/5 p-6 md:p-8">
          <h2 className="mb-4 font-display text-h2 font-semibold">{d.explainers}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {feed.explainers.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 className="mb-4 font-display text-h2 font-semibold">{d.mostRead}</h2>
          {feed.mostRead.slice(0, 10).map((a, i) => (
            <ArticleCard key={a.id} article={a} locale={locale} variant="numbered" index={i} />
          ))}
        </div>
        <div className="lg:col-span-5">
          <h2 className="mb-4 font-display text-h2 font-semibold">{d.webStories}</h2>
          <div className="flex gap-3 overflow-x-auto snap-x">
            {feed.secondary.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="compact" />
            ))}
          </div>
        </div>
      </section>

      <WhatsAppCTA locale={locale} />
      <NewsletterCTA locale={locale} />
    </div>
  )
}
