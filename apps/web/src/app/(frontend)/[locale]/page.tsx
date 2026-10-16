import { ArrowRight, BriefcaseBusiness, Cpu, Flag, Globe, Hash, Images, Newspaper, Trophy, Wallet } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ArticleCard as Card, Locale } from '@zaviya/shared'
import { ArticleCard } from '@/components/article/ArticleCard'
import { AdSlot } from '@/components/ads/AdSlot'
import { HomeLatest } from '@/components/home/HomeLatest'
import { LeadCarousel } from '@/components/home/LeadCarousel'
import { LiveRefresh } from '@/components/home/LiveRefresh'
import { DeskHead, LeadStory, PictureStory, ThumbStory, TopList, Wire } from '@/components/home/Newsroom'
import { RatesWidget } from '@/components/home/RatesWidget'
import { ScrollFeature } from '@/components/home/ScrollFeature'
import { SectionHeader } from '@/components/home/SectionHeader'
import { Slider } from '@/components/home/Slider'
import { TOOLS } from '@/components/home/tools'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { NamazWidget } from '@/components/namaz/NamazWidget'
import { getCategoryFeed, getFrontPagePlan, getHomeFeed, getRatesTicker, getTopStories, getTrendingTags, getUpcoming } from '@/lib/queries'
import { SECTION_CATEGORIES, type FrontSection, type PinSection } from '@/lib/front-page'
import { parseLocale } from '@/lib/locale'
import { formatNumber } from '@/lib/format'
import { localePath, t } from '@/lib/i18n'
import { buildPageMetadata, SECTION_SEO } from '@/lib/seo'
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
  const [feed, plan, rates, tags, top24, upcoming] = await Promise.all([
    getHomeFeed(locale),
    getFrontPagePlan(locale),
    getRatesTicker(locale),
    getTrendingTags(locale, 8),
    getTopStories(locale, 24, 12),
    getUpcoming(4).catch(() => []),
  ])
  // Each section draws from its own category feed, so the front block above never empties it
  const sectionSlugs = [...new Set(Object.values(SECTION_CATEGORIES).flat())]
  const pools = Object.fromEntries(
    await Promise.all(sectionSlugs.map(async (slug) => [slug, (await getCategoryFeed(locale, slug, 1).catch(() => null))?.docs ?? []] as const)),
  ) as Record<string, Card[]>

  // Every story appears once on the page, in the first slot that wants it. Stories the editor
  // took off the homepage never appear.
  const shown = new Set<string>(plan.hidden)
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
  const railOf = (slugs: readonly string[]) => slugs.flatMap((slug) => pools[slug] ?? []).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  // A section: the editor's pins first, then its newest stories
  const section = (key: PinSection, n: number) => take([...(plan.pins[key] ?? []), ...railOf(SECTION_CATEGORIES[key])], n)

  const lead = take([...(plan.lead ? [plan.lead] : []), ...feed.latest], 1)[0]
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
  const top = take(top24, 5)
  // The editor's lead stays first; the next pictured stories rotate after it
  const slides = [lead, ...take(feed.latest, 4, (a) => Boolean(a.image))]
  const seconds = take([...plan.seconds, ...feed.latest], 5)
  const wire = take(feed.latest, 6)
  const underLead = take(feed.latest, 3, (a) => Boolean(a.image))
  const leadList = take(feed.latest, 4)
  const pakistan = section('pakistan', 7)
  const money = section('money', 7)
  const world = section('world', 9)
  const cricket = section('cricket', 3)
  const tech = section('tech-ai', 8)
  const jobs = section('jobs', 5)
  const explainers = take(feed.explainers, 3)
  const stories = take(feed.latest, 8, (a) => Boolean(a.image))
  const more = take([...feed.latest, ...Object.values(pools).flat()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)), 24)
  const namaz = todayForAllCities()
  const slide = { prev: isUr ? 'پچھلی' : 'Previous', next: isUr ? 'اگلی' : 'Next' }
  const path = (p: string) => localePath(locale, p)
  const color = (slug: string, fallback: string) => feed.rails.find((r) => r.category.slug === slug)?.category.color ?? fallback
  const name = (slug: string, fallback: string) => feed.rails.find((r) => r.category.slug === slug)?.category.name ?? fallback

  const blocks: Record<FrontSection, ReactNode> = {
    pakistan: pakistan.length > 0 && (
      <section aria-label={name('pakistan', 'Pakistan')}>
        <DeskHead title={name('pakistan', 'Pakistan')} href={path('/pakistan')} more={d.seeAll} color={color('pakistan', '#0E7C5A')} icon={Flag} />
        <ScrollFeature
          accent={color('pakistan', '#0E7C5A')}
          counter={isUr ? 'میں سے' : 'of'}
          features={pakistan.map((a) => (
            <PictureStory key={a.id} article={a} locale={locale} size="lg" dek />
          ))}
          rows={pakistan.map((a) => (
            <ThumbStory key={a.id} article={a} locale={locale} />
          ))}
        />
      </section>
    ),

    money: money.length > 0 && (
      <section aria-label={isUr ? 'آپ کا پیسہ' : 'Your money'} className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-5 md:p-7 dark:border-border dark:bg-surface">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-amber-800 dark:text-amber-300">{isUr ? 'کاروبار · آٹوز · ریٹس' : 'Business · Autos · Rates'}</p>
            <h2 className="mt-1 flex items-center gap-2 font-display text-[1.9rem] font-extrabold">
              <Wallet className="h-6 w-6 text-amber-700 dark:text-amber-300" aria-hidden />
              {isUr ? 'آپ کا پیسہ' : 'Your money'}
            </h2>
          </div>
          <Link href={path('/business')} className="inline-flex items-center gap-1 text-sm font-bold text-amber-800 hover:underline dark:text-amber-300">
            {d.seeAll}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
        <div className={cn('grid gap-7', rates.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_280px]')}>
          <ScrollFeature
            accent="#B45309"
            counter={isUr ? 'میں سے' : 'of'}
            features={money.map((a) => (
              <PictureStory key={a.id} article={a} locale={locale} size="lg" dek />
            ))}
            rows={money.map((a) => (
              <ThumbStory key={a.id} article={a} locale={locale} label />
            ))}
          />
          {rates.length > 0 && (
            <div className="flex flex-col gap-1 self-start rounded-2xl border border-amber-200 bg-surface p-4 lg:sticky lg:top-24 dark:border-border">
              <b className="mb-1 text-[15px]">{isUr ? 'مارکیٹ ابھی' : 'Markets now'}</b>
              {rates.slice(0, 6).map((r) => (
                <Link key={r.series} href={r.href} className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm hover:text-accent">
                  <span className="truncate text-fg-muted">{r.label}</span>
                  <b className="tabular-nums">
                    {formatNumber(r.value, locale)}{' '}
                    {r.change !== 0 && <span className={r.change > 0 ? 'text-up' : 'text-down'}>{r.change > 0 ? '▲' : '▼'}</span>}
                  </b>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    ),

    namaz: (
      <section aria-label={isUr ? 'آج پاکستان میں' : 'Your day in Pakistan'} className="bg-ink py-12 text-ink-muted md:py-14">
        <div className="container-wide">
          <p className="eyebrow text-emerald-400">{isUr ? 'نماز، ریٹس اور اہم تاریخیں' : 'Prayer times, rates and dates'}</p>
          <h2 className="mb-7 mt-1.5 font-display text-[2rem] font-extrabold text-ink-fg md:text-[2.3rem]">{isUr ? 'آج پاکستان میں' : 'Your day in Pakistan'}</h2>
          <div className={cn('grid grid-cols-1 gap-5', rates.length ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
            <NamazWidget
              locale={locale}
              href={path('/namaz-timings')}
              serverMinutes={namaz.minutes}
              cities={namaz.cities.map((c) => ({ slug: c.city.slug, en: c.city.en, ur: c.city.ur, times: c.times }))}
            />
            {rates.length > 0 && <RatesWidget locale={locale} rates={rates} />}
            <div className="flex flex-col gap-3 rounded-[22px] border border-ink-line bg-ink-2 p-5 md:p-6">
              <h3 className="font-sans text-[17px] font-extrabold text-ink-fg">{isUr ? 'آنے والی تاریخیں' : 'Coming up'}</h3>
              {upcoming.length > 0 ? (
                <ul className="divide-y divide-ink-line">
                  {upcoming.map((e) => (
                    <li key={`${e.date}-${e.title}`} className="flex items-center gap-3 py-2.5">
                      <span className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-ink py-1 leading-none">
                        <span className="text-[10px] font-bold uppercase">{new Date(e.date).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</span>
                        <span className="font-display text-lg font-bold text-ink-fg">{new Date(e.date).getUTCDate()}</span>
                      </span>
                      <span className="text-[0.95rem] font-semibold leading-snug text-ink-fg">{e.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {TOOLS.slice(0, 6).map((tool) => (
                    <Link key={tool.path} href={path(tool.path)} className="rounded-full border border-ink-line px-3 py-1.5 text-sm font-semibold text-ink-fg hover:border-emerald-400">
                      {isUr ? tool.ur : tool.en}
                    </Link>
                  ))}
                </div>
              )}
              <Link href={path('/namaz-timings')} className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-emerald-300 hover:text-emerald-200">
                {isUr ? 'تمام شہروں کے اوقات نماز' : 'Prayer times for every city'}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    ),

    'world-cricket': (world.length > 0 || cricket.length > 0) && (
      <div className={cn('grid gap-8', world.length > 0 && cricket.length > 0 && 'lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]')}>
        {world.length > 0 && (
          <section aria-label={name('world', 'World')} className="min-w-0">
            <DeskHead title={name('world', 'World')} href={path('/world')} more={d.seeAll} color={color('world', '#2B59C3')} icon={Globe} />
            <Slider labels={slide} itemClass={cricket.length ? 'w-[78%] sm:w-[calc((100%-2.5rem)/3)]' : undefined}>
              {world.slice(0, 6).map((a) => (
                <PictureStory key={a.id} article={a} locale={locale} dek />
              ))}
            </Slider>
            {world.length > 6 && (
              <div className="mt-2 grid gap-x-6 border-t border-border sm:grid-cols-3">
                {world.slice(6).map((a) => (
                  <ThumbStory key={a.id} article={a} locale={locale} />
                ))}
              </div>
            )}
          </section>
        )}
        {cricket.length > 0 && (
          <section aria-label={name('cricket', 'Cricket')} className="min-w-0 rounded-[22px] bg-ink p-5 text-ink-fg md:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2.5 font-display text-[1.4rem] font-extrabold">
                <Trophy className="h-5 w-5 text-teal-300" aria-hidden />
                {name('cricket', 'Cricket')}
              </h2>
              <Link href={path('/cricket')} className="inline-flex items-center gap-1 text-sm font-bold text-teal-300 hover:underline">
                {d.seeAll}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
            <PictureStory article={cricket[0]!} locale={locale} size="lg" />
            <div className="divide-y divide-ink-line">
              {cricket.slice(1).map((a) => (
                <ThumbStory key={a.id} article={a} locale={locale} tone="dark" />
              ))}
            </div>
          </section>
        )}
      </div>
    ),

    'tech-ai': tech.length > 0 && (
      <section aria-label={isUr ? 'ٹیکنالوجی اور اے آئی' : 'Tech & AI'}>
        <DeskHead title={isUr ? 'ٹیکنالوجی اور اے آئی' : 'Tech & AI'} href={path('/tech-telecom')} more={d.seeAll} color={color('tech-telecom', '#7B4DFF')} icon={Cpu} />
        <Slider labels={slide}>
          {tech.map((a) => (
            <PictureStory key={a.id} article={a} locale={locale} />
          ))}
        </Slider>
      </section>
    ),

    jobs: (jobs.length > 0 || explainers.length > 0) && (
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        {jobs.length > 0 && (
          <section aria-label={name('education-jobs', 'Jobs')} className="card-surface p-5 md:p-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-[1.4rem] font-extrabold" style={{ color: color('education-jobs', '#C2185B') }}>
                <BriefcaseBusiness className="h-5 w-5" aria-hidden />
                {isUr ? 'تعلیم اور نوکریاں' : 'Jobs & education'}
              </h2>
              <Link href={path('/education-jobs')} className="inline-flex items-center gap-1 text-sm font-bold text-fg-muted hover:text-accent">
                {d.seeAll}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
            <div className="grid gap-x-7 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 [&>*]:border-border sm:[&>*]:border-b">
              {jobs.map((a) => (
                <ThumbStory key={a.id} article={a} locale={locale} />
              ))}
            </div>
          </section>
        )}
        <section aria-label={d.explainers} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-orange-200 bg-orange-50/70 p-5 dark:border-border dark:bg-surface">
          <h2 className="font-display text-[1.4rem] font-extrabold">{isUr ? 'زاویہ وضاحت' : 'Zaviya explains'}</h2>
          {explainers.map((a) => (
            <ArticleCard key={a.id} article={a} locale={locale} variant="side" />
          ))}
          {tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Link key={tag.slug} href={path(`/tag/${tag.slug}`)} className="chip">
                  <Hash className="h-3.5 w-3.5 text-amber" aria-hidden />
                  {tag.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    ),

    stories: stories.length >= 4 && (
      <section aria-label={isUr ? 'تصویروں میں' : 'In pictures'}>
        <SectionHeader title={isUr ? 'تصویروں میں' : 'In pictures'} icon={Images} />
        <Slider labels={slide} itemClass="w-[44%] sm:w-[30%] lg:w-[calc((100%-6.25rem)/6)]">
          {stories.map((a) => (
            <ArticleCard key={a.id} article={a} locale={locale} variant="overlay" />
          ))}
        </Slider>
      </section>
    ),

    more: more.length > 0 && (
      <section aria-label={isUr ? 'مزید خبریں' : 'More news'}>
        <SectionHeader title={isUr ? 'مزید خبریں' : 'More news'} icon={Newspaper} />
        <HomeLatest locale={locale} initial={more} />
      </section>
    ),
  }

  return (
    <div className="pb-6">
      <h1 className="sr-only">{isUr ? 'زاویہ: پاکستان کی تازہ ترین خبریں' : 'Zaviya News: Latest Pakistan news'}</h1>
      <LiveRefresh locale={locale} />

      {/* ── Front page: the editor's lead, the next stories, the wire and the top stories ── */}
      <section aria-label={isUr ? 'صفحہ اول' : 'Front page'} className="container-wide pt-6">
        <div className="card-surface grid gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_320px] xl:gap-0">
          <div className="flex min-w-0 flex-col gap-6 xl:border-e xl:border-border xl:pe-6">
            <LeadCarousel
              titles={slides.map((a) => a.title)}
              labels={{ prev: isUr ? 'پچھلی خبر' : 'Previous story', next: isUr ? 'اگلی خبر' : 'Next story', slide: isUr ? 'اہم خبر' : 'Top story' }}
            >
              {slides.map((a, i) => (
                <LeadStory key={a.id} article={a} locale={locale} priority={i === 0} />
              ))}
            </LeadCarousel>
            {underLead.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-3">
                {underLead.map((a) => (
                  <PictureStory key={a.id} article={a} locale={locale} size="sm" />
                ))}
              </div>
            )}
            {leadList.length > 0 && (
              <div className="grid gap-x-6 border-t border-border sm:grid-cols-2">
                {leadList.map((a) => (
                  <ThumbStory key={a.id} article={a} locale={locale} label />
                ))}
              </div>
            )}
          </div>
          <div className="grid min-w-0 gap-x-6 border-t border-border pt-4 sm:grid-cols-2 xl:block xl:divide-y xl:divide-border xl:border-t-0 xl:px-6 xl:pt-0">
            {seconds.map((a, i) =>
              i === 0 ? (
                <div key={a.id} className="pb-4">
                  <PictureStory article={a} locale={locale} dek />
                </div>
              ) : (
                <ThumbStory key={a.id} article={a} locale={locale} label />
              ),
            )}
          </div>
          <div className="grid min-w-0 content-start gap-5 md:grid-cols-2 xl:flex xl:flex-col xl:border-s xl:border-border xl:ps-6">
            {wire.length > 0 && <Wire locale={locale} items={wire} />}
            {top.length > 0 && <TopList locale={locale} items={top} />}
          </div>
        </div>
      </section>

      {/* ── Sections, in the editor's order. The namaz band runs edge to edge. ── */}
      {plan.order.map((key, i) =>
        blocks[key] ? (
          <div key={key} className={key === 'namaz' ? 'mt-14' : 'container-wide mt-14'}>
            {blocks[key]}
            {i === 1 && (
              <div className={key === 'namaz' ? 'container-wide' : undefined}>
                <AdSlot locale={locale} size="leaderboard" />
              </div>
            )}
          </div>
        ) : null,
      )}
      <div className="container-wide mt-14">
        <WhatsAppCTA locale={locale} />
      </div>
    </div>
  )
}
