import Image from 'next/image'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { dataPageSlugToKey } from '@/lib/seo'
import { getArticle, getArticleBySlug, getDuplicateReplacementHref, getRelated, getMostRead, getRatesTicker, getCategoryFeed, getTagStoryCount } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import {
  articleKeywords,
  articleShareImage,
  breadcrumbJsonLd,
  buildPageMetadata,
  faqJsonLd,
  liveBlogJsonLd,
  newsArticleJsonLd,
} from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { isThinTag } from '@/lib/tag-rules'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { ReadingProgress } from '@/components/layout/ReadingProgress'
import { Kicker } from '@/components/article/Kicker'
import { LiveBadge } from '@/components/article/LiveBadge'
import { PreferredSourcePrompt } from '@/components/marketing/PreferredSourcePrompt'
import { ShareBar, MobileShareBar } from '@/components/article/ShareBar'
import { SocialEmbeds } from '@/components/article/SocialEmbeds'
import { SectionHeader } from '@/components/home/SectionHeader'
import { KeyPoints } from '@/components/article/KeyPoints'
import { ArticleBodyWithAds } from '@/components/article/ArticleBodyWithAds'
import { WhatItMeans } from '@/components/article/WhatItMeans'
import { LiveUpdates } from '@/components/article/LiveUpdates'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { AuthorBox } from '@/components/article/AuthorBox'
import { ArticleCard } from '@/components/article/ArticleCard'
import { ArticleToolbar } from '@/components/article/ArticleToolbar'
import { AuthorAvatar } from '@/components/article/AuthorBox'
import { NextPrayerCard } from '@/components/namaz/NextPrayerCard'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { todayForAllCities } from '@/lib/prayer-times'
import { formatNumber } from '@/lib/format'
import { Eye, TrendingUp } from 'lucide-react'
import { AdSlot } from '@/components/ads/AdSlot'
import { formatDateTime } from '@/lib/format'
import { canBuildWebStory, webStoryPath } from '@/lib/web-story'
import type { Locale } from '@zaviya/shared'

export const revalidate = 300

// Render on first request, then serve from the ISR cache (without this Next 16 renders every request)
export async function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ locale: string; category: string; slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { locale: l, category, slug } = await params
  if (dataPageSlugToKey(category)) return {}
  const locale = parseLocale(l)
  const article = await getArticle(locale, category, slug)
  if (!article) return {}
  const enPath = locale === 'en' ? article.href : article.alternateHref
  const urPath = locale === 'ur' ? article.href : article.alternateHref
  const share = articleShareImage(article)
  return buildPageMetadata({
    locale,
    title: article.seo.metaTitle ?? article.title,
    description: article.seo.metaDescription ?? article.dek,
    enPath,
    urPath,
    section: article.category.name,
    tags: article.tags?.map((tg) => tg.name),
    keywords: articleKeywords(article),
    // The story's own photo when it has one; an editor-set SEO image wins
    ogImage: article.seo.ogImage ?? share.url,
    ogImageSize: article.seo.ogImage ? undefined : share.size,
    type: 'article',
    publishedTime: article.publishedAt,
    modifiedTime: article.updatedAt,
    noindex: article.seo.noindex,
  })
}

export default async function ArticlePage({ params }: Props) {
  const { locale: l, category, slug } = await params
  if (dataPageSlugToKey(category)) notFound()
  const locale = parseLocale(l) as Locale
  const article = await getArticle(locale, category, slug)
  if (!article) {
    // Legacy /news/<slug> (and other wrong-section) links: send to the canonical section URL
    const canonical = await getArticleBySlug(locale, slug)
    if (canonical && canonical.href !== `/${category}/${slug}`) permanentRedirect(canonical.href)
    // An unpublished duplicate: send readers and Google to the live article of the same story
    const kept = await getDuplicateReplacementHref(locale, slug)
    if (kept && kept !== `/${category}/${slug}`) permanentRedirect(kept)
    notFound()
  }

  const d = t(locale)
  const isUr = locale === 'ur'
  const [related, mostRead, rates, sameSection] = await Promise.all([
    getRelated(locale, article.id, 6),
    getMostRead(locale, 6),
    getRatesTicker(locale),
    getCategoryFeed(locale, article.category.slug, 1),
  ])
  const tagLinkable = await Promise.all(
    article.tags.map((tag) =>
      getTagStoryCount(locale, tag.slug)
        .then((n) => !isThinTag(n))
        .catch(() => false),
    ),
  )
  const relatedIds = new Set([article.id, ...related.map((a) => a.id)])
  const moreFromSection = (sameSection?.docs ?? []).filter((a) => !relatedIds.has(a.id)).slice(0, 6)
  const namaz = todayForAllCities()

  const publicPath = article.href

  return (
    <>
      <ReadingProgress />
      <JsonLd
        data={[
          newsArticleJsonLd(article, locale),
          breadcrumbJsonLd([
            { name: d.nav.home, url: localePath(locale, '/') },
            { name: article.category.name, url: localePath(locale, `/${category}`) },
            { name: article.title, url: publicPath },
          ]),
          ...(article.faqs.length ? [faqJsonLd(article.faqs)] : []),
          ...(article.isLive ? [liveBlogJsonLd(article)] : []),
        ]}
      />
      <article className="container-wide pb-10 pt-6 md:pt-8">
        <Breadcrumbs
          items={[
            { label: d.nav.home, href: localePath(locale, '/') },
            { label: article.category.name, href: localePath(locale, `/${category}`) },
          ]}
        />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-14">
          <div className="min-w-0">
            <header className="max-w-[780px]">
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                <Link
                  href={localePath(locale, `/${category}`)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] hover:border-accent rtl:tracking-normal"
                  style={{ color: article.category.color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: article.category.color }} aria-hidden />
                  {article.category.name}
                </Link>
                {article.isLive && <LiveBadge locale={locale} />}
              </div>
              <h1 className={`font-display text-[clamp(2.1rem,1.5rem+2.2vw,3.4rem)] font-extrabold ${isUr ? 'leading-[1.7]' : 'leading-[1.04]'}`}>{article.title}</h1>
              {article.dek && <p className="mt-4 font-serif text-[1.3em] leading-snug text-fg-muted">{article.dek}</p>}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
                <div className="flex items-center gap-3">
                  <AuthorAvatar author={article.author} size={46} />
                  <div className="text-sm leading-snug">
                    <Link href={localePath(locale, `/author/${article.author.slug}`)} className="font-extrabold hover:text-accent">
                      {article.author.name}
                    </Link>
                    <p className="mt-0.5 text-fg-subtle">
                      <time dateTime={article.publishedAt}>{formatDateTime(article.publishedAt, locale)}</time>
                      {article.updatedAt && new Date(article.updatedAt).getTime() - new Date(article.publishedAt).getTime() > 15 * 60_000 && (
                        <>
                          {' · '}
                          {d.updated} <time dateTime={article.updatedAt}>{formatDateTime(article.updatedAt, locale)}</time>
                        </>
                      )}
                      {article.readingTime ? ` · ${article.readingTime} ${d.minRead}` : ''}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <ArticleToolbar locale={locale} minutes={article.readingTime} />
                <ShareBar locale={locale} title={article.title} path={publicPath} />
              </div>
              {article.alternateHref && (
                <Link
                  href={article.alternateHref}
                  hrefLang={locale === 'en' ? 'ur' : 'en'}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:text-accent"
                >
                  {locale === 'en' ? 'یہ خبر اردو میں پڑھیں' : 'Read this story in English'} →
                </Link>
              )}
            </header>

            {article.image && (
              <figure className="my-8">
                <div className="relative aspect-video overflow-hidden rounded-[var(--radius-card)] bg-surface-2">
                  <Image src={article.image.url} alt={article.image.alt} fill priority className="object-cover" sizes="(max-width:1024px) 100vw, 900px" />
                </div>
                {(article.image.credit || article.image.alt) && (
                  <figcaption className="mt-2.5 flex flex-wrap justify-between gap-2 text-[13px] text-fg-subtle">
                    <span>{article.image.alt}</span>
                    {article.image.credit && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold">{article.image.credit}</span>}
                  </figcaption>
                )}
              </figure>
            )}

            <div className="max-w-[760px]">
              <KeyPoints points={article.keyPoints} locale={locale} />
              <div id="article-body">
                <ArticleBodyWithAds data={article.body} locale={locale} />
              </div>
              {article.whatItMeans != null ? <WhatItMeans body={article.whatItMeans} locale={locale} /> : null}
              <SocialEmbeds embeds={article.embeds ?? []} locale={locale} />
              <LiveUpdates locale={locale} updates={article.updates} isLive={article.isLive} />
              <FAQAccordion faqs={article.faqs} locale={locale} />
              {article.corrections.map((c, i) => (
                <p key={i} className="my-4 rounded-2xl bg-surface-2 p-4 text-sm">
                  <strong>{d.corrections}:</strong> {c.note}
                </p>
              ))}
              {article.tags.length > 0 && (
                <div className="my-8 flex flex-wrap gap-2">
                  {article.tags.map((tag, i) =>
                    // A tag page with under 3 stories is noindex: show the chip but do not send crawlers there (ZAV-221)
                    tagLinkable[i] ? (
                      <Link key={tag.slug} href={localePath(locale, `/tag/${tag.slug}`)} className="chip">
                        #{tag.name}
                      </Link>
                    ) : (
                      <span key={tag.slug} className="chip">
                        #{tag.name}
                      </span>
                    ),
                  )}
                </div>
              )}
              <div className="my-8 flex flex-wrap items-center gap-3 rounded-[22px] border border-border bg-surface p-4">
                <span className="text-sm font-bold">{isUr ? 'یہ خبر شیئر کریں' : 'Share this story'}</span>
                <ShareBar locale={locale} title={article.title} path={publicPath} />
                {canBuildWebStory(article) ? (
                  <Link href={localePath(locale, webStoryPath(slug))} className="ms-auto text-sm font-bold text-accent hover:underline">
                    {d.webStories} →
                  </Link>
                ) : null}
              </div>
              <PreferredSourcePrompt locale={locale} />
              <div className="mt-6">
                <AuthorBox author={article.author} locale={locale} />
              </div>
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-40 space-y-5">
              <NextPrayerCard
                locale={locale}
                href={localePath(locale, '/namaz-timings')}
                serverMinutes={namaz.minutes}
                cities={namaz.cities.map((c) => ({ slug: c.city.slug, en: c.city.en, ur: c.city.ur, times: c.times }))}
              />
              {rates.length > 0 && (
                <div className="rounded-[22px] bg-ink p-5 text-ink-muted">
                  <p className="mb-2 flex items-center gap-2 font-extrabold text-ink-fg">
                    <TrendingUp className="h-4 w-4 text-amber-300" aria-hidden />
                    {isUr ? 'آج کے ریٹ' : 'Live rates'}
                  </p>
                  <div className="divide-y divide-ink-line">
                    {rates.map((r) => (
                      <Link key={r.series} href={isUr ? `/ur${r.href}` : r.href} className="flex justify-between gap-3 py-2.5 text-sm hover:text-ink-fg">
                        <span>{r.label}</span>
                        <b dir="ltr" className="text-white tabular-nums">
                          {formatNumber(r.value)}
                        </b>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
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
              <WhatsAppCTA locale={locale} compact />
              <AdSlot locale={locale} size="skyscraper" />
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-14 border-t border-border pt-10">
            <SectionHeader title={isUr ? 'اگلی خبر پڑھیں' : 'Read next'} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((a) => (
                <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
              ))}
            </div>
          </section>
        )}
        {moreFromSection.length > 0 && (
          <section className="mt-12">
            <SectionHeader
              title={`${d.moreFromCategory} ${article.category.name}`}
              color={article.category.color}
              href={localePath(locale, `/${category}`)}
              linkLabel={d.seeAll}
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {moreFromSection.map((a) => (
                <ArticleCard key={a.id} article={a} locale={locale} variant="side" />
              ))}
            </div>
          </section>
        )}
      </article>
      <MobileShareBar locale={locale} title={article.title} path={publicPath} />
    </>
  )
}
