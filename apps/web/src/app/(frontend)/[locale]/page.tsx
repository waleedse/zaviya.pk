import { ArrowRight, Eye, Flame, Hash, Images, Newspaper, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { ArticleCard as Card, Locale } from '@zaviya/shared'
import { ArticleCard } from '@/components/article/ArticleCard'
import { AdSlot } from '@/components/ads/AdSlot'
import { HomeLatest } from '@/components/home/HomeLatest'
import { RatesWidget } from '@/components/home/RatesWidget'
import { SectionHeader } from '@/components/home/SectionHeader'
import { SectionTabs } from '@/components/home/SectionTabs'
import { TOOLS } from '@/components/home/tools'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { NameFinder } from '@/components/names/NameFinder'
import { NamazWidget } from '@/components/namaz/NamazWidget'
import { getHomeFeed, getRatesTicker, getTrendingTags } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import { buildPageMetadata, SECTION_SEO } from '@/lib/seo'
import { BABY_NAMES, trendingNames } from '@/lib/baby-names'
import { todayForAllCities } from '@/lib/prayer-times'
import { cn } from '@/lib/utils'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const seo = SECTION_SEO.home![locale]
  return buildPageMetadata({
    locale,
    title: seo.title,
    description: seo.description,
    enPath: '/',
    urPath: '/ur',
    absoluteTitle: true,
  })
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale) as Locale
  const d = t(locale)
  const isUr = locale === 'ur'
  const [feed, rates, tags] = await Promise.all([getHomeFeed(locale), getRatesTicker(locale), getTrendingTags(locale, 10)])

  // Each story appears once in the main river, in its most prominent slot.
  const shown = new Set<string>()
  const take = (list: Card[], n: number, filter: (a: Card) => boolean = () => true) => {
    const out: Card[] = []
    for (const a of list) {
      if (out.length >= n) break
      if (shown.has(a.id) || !filter(a)) continue
      shown.add(a.id)
      out.push(a)
    }
    return out
  }

  const lead = feed.hero ? take([feed.hero], 1)[0] : undefined
  if (!lead) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-display text-h1 font-bold">{isUr ? 'خبریں جلد آ رہی ہیں' : 'The first stories are on their way'}</h1>
        <p className="mx-auto mt-3 max-w-md text-fg-muted">
          {isUr ? 'ہمارا نیوز ڈیسک تازہ ترین خبریں تیار کر رہا ہے۔' : 'Our newsdesk is preparing the latest coverage. Check back in a few minutes.'}
        </p>
      </div>
    )
  }

  const secondary = take(feed.secondary, 3)
  const leadMore = take(feed.latest, 6)
  const latestRail = feed.latest.slice(0, 9)
  const topStories = take(feed.latest, 8)
  // Chronological, so it may repeat stories shown above.
  const live = feed.live.length ? feed.live.slice(0, 5) : feed.latest.slice(0, 5)
  const explainers = take(feed.explainers, 3)
  const visual = take(feed.latest, 8, (a) => Boolean(a.image))
  const more = take(feed.latest, 24)
  const mostRead = feed.mostRead.slice(0, 8)
  const namaz = todayForAllCities()

  return (
    <div className="pb-6">
      <h1 className="sr-only">{isUr ? 'زاویہ: پاکستان کی تازہ ترین خبریں' : 'Zaviya: Latest Pakistan news'}</h1>

      {/* ── Front page: lead, three seconds and the live "Latest" rail ── */}
      <section className="container-wide grid gap-6 pt-6 md:pt-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.92fr)]">
        {/* Lead column: the lead story, then extra headlines so it ends level with its neighbours */}
        <div className="flex flex-col gap-5">
          <ArticleCard article={lead} locale={locale} variant="lead" priority />
          {leadMore.length > 0 && (
            <div className="card-surface flex-1 px-5 py-2 md:px-6">
              <p className="eyebrow pb-1 pt-3 text-fg-subtle">{isUr ? 'مزید اہم خبریں' : 'More headlines'}</p>
              <div className="grid gap-x-8 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
                {leadMore.map((a) => (
                  <ArticleCard key={a.id} article={a} locale={locale} variant="row" className="sm:border-t sm:border-border" />
                ))}
              </div>
            </div>
          )}
        </div>
        {secondary.length > 0 && (
          <div className="flex flex-col gap-4 lg:order-3 lg:col-span-2 lg:grid lg:grid-cols-3 xl:order-none xl:col-span-1 xl:flex">
            {secondary.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
            ))}
          </div>
        )}
        <aside className="card-surface flex flex-col p-5 md:p-6" aria-label={d.latest}>
          <SectionHeader title={d.latest} href={localePath(locale, '/live')} linkLabel={d.seeAll} icon={Newspaper} tile="bg-red-50 text-breaking dark:bg-red-950" />
          <div>
            {latestRail.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="list" />
            ))}
          </div>
          <Link
            href={localePath(locale, '/live')}
            className="mt-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-soft text-sm font-bold text-accent hover:brightness-95"
          >
            {isUr ? 'لائیو فیڈ کھولیں' : 'Open live feed'}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
        </aside>
      </section>

      {/* ── Top stories grid: eight more cards straight under the fold ── */}
      {topStories.length > 0 && (
        <section className="container-wide mt-12">
          <SectionHeader title={isUr ? 'اہم خبریں' : 'Top stories'} icon={Sparkles} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {topStories.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
            ))}
          </div>
        </section>
      )}

      {/* ── "Your day" utilities band ── */}
      <section className="mt-14 bg-ink py-12 text-ink-muted md:py-14">
        <div className="container-wide">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-emerald-400">{isUr ? 'روزمرہ معلومات' : 'Live utilities'}</p>
              <h2 className="mt-1.5 font-display text-[2rem] font-extrabold text-ink-fg md:text-[2.3rem]">{isUr ? 'آج پاکستان میں' : 'Your day in Pakistan'}</h2>
            </div>
          </div>
          <div className={cn('grid grid-cols-1 gap-5', rates.length ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
            <NamazWidget
              locale={locale}
              href={localePath(locale, '/namaz-timings')}
              serverMinutes={namaz.minutes}
              cities={namaz.cities.map((c) => ({ slug: c.city.slug, en: c.city.en, ur: c.city.ur, times: c.times }))}
            />
            {rates.length > 0 && <RatesWidget locale={locale} rates={rates} />}
            <div className="flex flex-col gap-4 rounded-[22px] border border-ink-line bg-ink-2 p-5 md:p-6">
              <h3 className="flex items-center gap-2.5 font-sans text-[17px] font-extrabold text-ink-fg">
                <span className="live-dot" aria-hidden />
                {feed.live.length ? d.liveNow : isUr ? 'ابھی ابھی' : 'Just in'}
              </h3>
              <ul className="divide-y divide-ink-line">
                {live.map((a) => (
                  <li key={a.id}>
                    <Link href={a.href} className="group block py-3">
                      <span className="kicker-text block" style={{ color: a.category.color }}>
                        {a.category.name}
                      </span>
                      <span className={cn('mt-1 block font-display text-[1.05rem] font-bold text-ink-fg group-hover:text-emerald-300', isUr ? 'leading-[1.8]' : 'leading-snug')}>
                        {a.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={localePath(locale, '/live')} className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-red-300 hover:text-red-200">
                {isUr ? 'تمام لائیو اپ ڈیٹس' : 'All live updates'}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="container-wide">
        <AdSlot locale={locale} size="leaderboard" />
      </div>

      {/* ── Sections as tabs ── */}
      <SectionTabs locale={locale} rails={feed.rails} title={isUr ? 'شعبہ وار اہم خبریں' : 'Top stories by section'} />

      {/* ── Daily tools ── */}
      <section className="container-wide mt-14">
        <div className="mb-5">
          <h2 className="font-display text-[1.9rem] font-extrabold md:text-[2.1rem]">{isUr ? 'روزمرہ ٹولز' : 'Daily tools'}</h2>
          <p className="mt-1 text-fg-muted">{isUr ? 'جو کچھ پاکستان روز دیکھتا ہے، ایک جگہ۔' : 'Everything Pakistan checks every day, one tap away.'}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TOOLS.map((tool) => (
            <Link key={tool.path} href={localePath(locale, tool.path)} className="card-lift flex flex-col gap-3.5 p-4">
              <span className={cn('icon-tile h-12 w-12 rounded-2xl', tool.tile)}>
                <tool.icon className="h-6 w-6" aria-hidden />
              </span>
              <span>
                <b className="block text-[15px]">{isUr ? tool.ur : tool.en}</b>
                <span className="text-[13px] text-fg-subtle">{isUr ? tool.subUr : tool.subEn}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Trending, most read, explainers ── */}
      <section className="container-wide mt-14 grid gap-5 lg:grid-cols-3">
        <div className="card-surface p-5 md:p-6">
          <SectionHeader title={isUr ? 'ٹرینڈنگ موضوعات' : 'Trending topics'} icon={Flame} tile="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" />
          {tags.length > 0 ? (
            <ol>
              {tags.map((tag, i) => (
                <li key={tag.slug} className="border-t border-border first:border-t-0">
                  <Link href={localePath(locale, `/tag/${tag.slug}`)} className="group grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                    <span className="text-center font-display text-lg font-extrabold text-fg-subtle">{i + 1}</span>
                    <span className="truncate font-bold group-hover:text-accent">
                      <Hash className="me-1 inline h-3.5 w-3.5 text-amber" aria-hidden />
                      {tag.name}
                    </span>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {tag.count} {isUr ? 'خبریں' : 'stories'}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex flex-wrap gap-2">
              {TOOLS.slice(0, 5).map((tool) => (
                <Link key={tool.path} href={localePath(locale, tool.path)} className="chip">
                  {isUr ? tool.ur : tool.en}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card-surface p-5 md:p-6">
          <SectionHeader title={d.mostRead} icon={Eye} />
          <div className="divide-y divide-border">
            {mostRead.map((a, idx) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="numbered" index={idx} />
            ))}
          </div>
        </div>
        <div className="rounded-[var(--radius-card)] border border-accent-line bg-accent-soft p-5 md:p-6">
          <SectionHeader title={d.explainers} icon={Sparkles} tile="bg-accent text-accent-fg" />
          <div className="flex flex-col gap-3">
            {(explainers.length ? explainers : take(feed.latest, 3)).map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="side" />
            ))}
          </div>
        </div>
      </section>

      {/* ── Baby names ── */}
      <section className="container-wide mt-14">
        <div className="grid gap-8 rounded-[28px] border border-orange-100 bg-[#fff7f0] p-5 md:p-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] dark:border-border dark:bg-surface">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-orange-100 px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                {isUr ? 'سب سے زیادہ تلاش' : 'Most searched tool'}
              </span>
              <span lang="ur" dir="rtl" className="font-urdu-sans text-lg leading-[1.5] text-orange-900 dark:text-orange-300">
                بچوں کے اسلامی نام
              </span>
            </div>
            <h2 className="font-display text-[2rem] font-extrabold leading-tight md:text-[2.4rem]">
              {isUr ? 'خوبصورت نام، معنی کے ساتھ' : 'Find a beautiful name, with its meaning'}
            </h2>
            <NameFinder locale={locale} names={BABY_NAMES} trending={trendingNames(8).map((n) => n.name)} href={localePath(locale, '/baby-names')} />
          </div>
          <div className="hidden flex-col gap-4 lg:flex">
            {/* eslint-disable-next-line @next/next/no-img-element -- static decorative SVG */}
            <img src="/illustrations/baby.svg" alt="" width={800} height={450} className="h-auto w-full rounded-3xl" />
            <div className="rounded-3xl border border-orange-100 bg-surface p-5 dark:border-border">
              <p className="eyebrow mb-3 text-orange-800 dark:text-orange-300">{isUr ? 'مجموعے' : 'Collections'}</p>
              <ul className="space-y-2 text-[15px] font-semibold">
                {[
                  ['quranic', isUr ? 'قرآنی نام' : 'Quranic names'],
                  ['prophets', isUr ? 'انبیاء کے نام' : 'Names of prophets'],
                  ['modern', isUr ? 'جدید اور منفرد نام' : 'Modern & unique names'],
                  ['turkish', isUr ? 'ترکی نام' : 'Turkish names'],
                ].map(([key, label]) => (
                  <li key={key}>
                    <Link href={`${localePath(locale, '/baby-names')}?collection=${key}`} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-orange-50 dark:hover:bg-surface-2">
                      {label}
                      <ArrowRight className="h-4 w-4 text-orange-700 rtl:rotate-180" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── In pictures ── */}
      {visual.length >= 4 && (
        <section className="container-wide mt-14">
          <SectionHeader title={isUr ? 'تصویروں میں' : 'In pictures'} icon={Images} />
          <div className="no-scrollbar -mx-4 grid snap-x auto-cols-[minmax(180px,1fr)] grid-flow-col gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {visual.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="overlay" className="snap-start" />
            ))}
          </div>
        </section>
      )}

      {/* ── More stories with load-more ── */}
      {more.length > 0 && (
        <section className="container-wide mt-14">
          <SectionHeader title={isUr ? 'مزید خبریں' : 'More stories'} icon={Newspaper} />
          <HomeLatest locale={locale} initial={more} />
        </section>
      )}

      <div className="container-wide mt-14">
        <WhatsAppCTA locale={locale} />
      </div>
    </div>
  )
}
