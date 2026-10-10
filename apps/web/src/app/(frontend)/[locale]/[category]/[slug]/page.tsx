import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { dataPageSlugToKey } from '@/lib/seo'
import { getArticle, getRelated, getMostRead, getRatesTicker } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import {
  articleOgUrl,
  breadcrumbJsonLd,
  buildPageMetadata,
  faqJsonLd,
  liveBlogJsonLd,
  newsArticleJsonLd,
} from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { ReadingProgress } from '@/components/layout/ReadingProgress'
import { Kicker } from '@/components/article/Kicker'
import { LiveBadge } from '@/components/article/LiveBadge'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { ShareBar } from '@/components/article/ShareBar'
import { KeyPoints } from '@/components/article/KeyPoints'
import { RichTextBody } from '@/components/article/RichTextBody'
import { WhatItMeans } from '@/components/article/WhatItMeans'
import { LiveUpdates } from '@/components/article/LiveUpdates'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { SourcesList } from '@/components/article/SourcesList'
import { AuthorBox } from '@/components/article/AuthorBox'
import { ArticleCard } from '@/components/article/ArticleCard'
import { RateCard } from '@/components/data/RateCard'
import { AdSlot } from '@/components/ads/AdSlot'
import { formatDateTime } from '@/lib/format'
import type { Locale } from '@zaviya/shared'
import { Badge } from '@/components/ui/badge'

export const revalidate = 300

type Props = { params: Promise<{ locale: string; category: string; slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { locale: l, category, slug } = await params
  if (dataPageSlugToKey(category)) return {}
  const locale = parseLocale(l)
  const article = await getArticle(locale, category, slug)
  if (!article) return {}
  const path = locale === 'ur' ? article.href : article.href.replace(/^\/ur/, '')
  return buildPageMetadata({
    locale,
    title: article.seo.metaTitle ?? article.title,
    description: article.seo.metaDescription ?? article.dek,
    path,
    urPath: article.alternateHref,
    ogImage: article.seo.ogImage ?? articleOgUrl(article),
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
  if (!article) notFound()

  const d = t(locale)
  const [related, mostRead, rates] = await Promise.all([
    getRelated(locale, article.id, 4),
    getMostRead(locale, 5),
    getRatesTicker(),
  ])

  const publicPath = locale === 'ur' ? article.href : article.href.replace(/^\/ur/, '') || article.href

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
      <article className="container-page py-8">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <Breadcrumbs
              items={[
                { label: d.nav.home, href: localePath(locale, '/') },
                { label: article.category.name, href: localePath(locale, `/${category}`) },
                { label: article.title },
              ]}
            />
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Kicker category={article.category} locale={locale} />
              {article.isLive && <LiveBadge locale={locale} />}
              {article.alternateHref && <LanguageSwitch locale={locale} href={article.alternateHref} />}
            </div>
            <h1 className="font-display text-h1 font-semibold leading-[1.1]">{article.title}</h1>
            {article.dek && <p className="mt-4 text-xl text-fg-muted">{article.dek}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <span>{article.author.name}</span>
              <span aria-hidden>·</span>
              <span>
                {d.published} {formatDateTime(article.publishedAt, locale)}
              </span>
              {article.updatedAt && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {d.updated} {formatDateTime(article.updatedAt, locale)}
                  </span>
                </>
              )}
              {article.readingTime != null && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {article.readingTime} {d.minRead}
                  </span>
                </>
              )}
            </div>
            <div className="my-6">
              <ShareBar locale={locale} title={article.title} path={publicPath} />
            </div>
            {article.image && (
              <figure className="mb-8">
                <div className="relative aspect-video overflow-hidden rounded-[var(--radius-image)] bg-surface-2">
                  <Image src={article.image.url} alt={article.image.alt} fill priority className="object-cover" sizes="(max-width:1024px) 100vw, 720px" />
                </div>
                {(article.image.credit || article.image.isAiGenerated) && (
                  <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                    {article.image.credit}
                    {article.image.isAiGenerated && <Badge variant="outline">AI-generated illustration</Badge>}
                  </figcaption>
                )}
              </figure>
            )}
            <KeyPoints points={article.keyPoints} locale={locale} />
            <RichTextBody data={article.body} />
            <AdSlot locale={locale} size="rectangle" />
            {article.whatItMeans != null ? <WhatItMeans body={article.whatItMeans} locale={locale} /> : null}
            <LiveUpdates locale={locale} updates={article.updates} isLive={article.isLive} />
            <FAQAccordion faqs={article.faqs} locale={locale} />
            <SourcesList sources={article.sources} locale={locale} />
            {article.corrections.map((c, i) => (
              <p key={i} className="my-4 text-sm text-fg-muted">
                <strong>{d.corrections}:</strong> {c.note}
              </p>
            ))}
            {article.tags.length > 0 && (
              <div className="my-8 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <Link key={tag.slug} href={localePath(locale, `/tag/${tag.slug}`)} className="rounded-[var(--radius-pill)] border border-border px-3 py-1 text-sm hover:border-accent/40">
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
            <AuthorBox author={article.author} locale={locale} />
            <section className="mt-12">
              <h2 className="mb-4 font-display text-h2 font-semibold">{d.related}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {related.map((a) => (
                  <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
                ))}
              </div>
            </section>
          </div>
          <aside className="hidden space-y-6 lg:col-span-4 lg:block">
            <div className="sticky top-32 space-y-6">
              <h2 className="font-semibold">{d.mostRead}</h2>
              {mostRead.map((a, i) => (
                <ArticleCard key={a.id} article={a} locale={locale} variant="numbered" index={i} />
              ))}
              <div className="grid gap-2">
                {rates.slice(0, 2).map((r) => (
                  <RateCard key={r.series} rate={r} locale={locale} />
                ))}
              </div>
              <AdSlot locale={locale} size="skyscraper" />
            </div>
          </aside>
        </div>
      </article>
    </>
  )
}
