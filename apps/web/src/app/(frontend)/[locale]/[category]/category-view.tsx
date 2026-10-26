import { notFound } from 'next/navigation'
import { CATEGORIES, type Locale } from '@zaviya/shared'
import DataPageView from '@/components/data/DataPageView'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Pagination } from '@/components/layout/Pagination'
import { PageHero } from '@/components/layout/PageHero'
import { ListingSidebar } from '@/components/layout/ListingSidebar'
import { categoryIcon } from '@/lib/category-icons'
import { getCategoryFeed, getDataPage, getLatestLinks, getMostRead } from '@/lib/queries'
import { LatestList } from '@/components/article/LatestList'
import { publicPath } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import { dataPageSlugToKey, SECTION_SEO } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo'


/** Category listing (page 1 at /[category], page n at /[category]/page/[n]). */
export async function renderCategoryPage(locale: Locale, category: string, pageNum: number) {

  const dataKey = dataPageSlugToKey(category)
  if (dataKey) {
    const page = await getDataPage(locale, dataKey)
    return <DataPageView locale={locale} page={page} slug={category} />
  }

  const feed = await getCategoryFeed(locale, category, pageNum)
  if (!feed) notFound()
  const catMeta = CATEGORIES.find((c) => c.slug === category)!
  const name = locale === 'ur' ? catMeta.ur : catMeta.en
  const d = t(locale)
  const basePath = localePath(locale, `/${category}`)
  const [mostRead, latest] = await Promise.all([getMostRead(locale, 6), pageNum === 1 ? getLatestLinks(locale, category, 1) : null])
  const featured = pageNum === 1 ? feed.docs[0] : undefined
  const seconds = pageNum === 1 ? feed.docs.slice(1, 3) : []
  const rest = pageNum === 1 ? feed.docs.slice(3) : feed.docs
  const isUr = locale === 'ur'

  return (
    <div className="pb-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: d.nav.home, url: localePath(locale, '/') },
          { name, url: publicPath(locale, [category]) },
        ])}
      />
      <PageHero
        title={name}
        description={SECTION_SEO[category]?.[locale].description}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: name }]}
        icon={categoryIcon(category)}
        color={catMeta.color}
        eyebrow={isUr ? 'سیکشن' : 'Section'}
        stats={feed.totalDocs ? [{ label: isUr ? 'خبریں' : 'stories', value: feed.totalDocs }] : undefined}
      />

      <div className="container-wide pt-8">
        {feed.docs.length === 0 ? (
          <p className="card-surface py-16 text-center text-fg-muted">{isUr ? 'اس سیکشن میں ابھی کوئی خبر نہیں۔' : 'No stories in this section yet.'}</p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-6">
              {featured && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <ArticleCard article={featured} locale={locale} variant="lead" priority />
                  {seconds.length > 0 && (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                      {seconds.map((a) => (
                        <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {rest.length > 0 && (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {rest.map((a) => (
                    <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
                  ))}
                </div>
              )}
              {latest && (
                <LatestList
                  locale={locale}
                  items={latest.docs}
                  title={isUr ? `${name}: تازہ ترین` : `Latest in ${name}`}
                  moreHref="/latest"
                  moreLabel={isUr ? 'تمام تازہ ترین خبریں' : 'All latest news'}
                />
              )}
              <Pagination locale={locale} page={feed.page} totalPages={feed.totalPages} basePath={basePath} />
            </div>
            <ListingSidebar locale={locale} mostRead={mostRead} />
          </div>
        )}
      </div>
    </div>
  )
}
