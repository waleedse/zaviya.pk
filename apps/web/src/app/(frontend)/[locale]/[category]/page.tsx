import { notFound } from 'next/navigation'
import { CATEGORIES, type Locale } from '@zaviya/shared'
import DataPageView from '@/components/data/DataPageView'
import { ArticleCard } from '@/components/article/ArticleCard'
import { AdSlot } from '@/components/ads/AdSlot'
import { Pagination } from '@/components/layout/Pagination'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { getCategoryFeed, getDataPage, getMostRead } from '@/lib/queries'
import { parseLocale, publicPath } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import { buildPageMetadata, dataPageSlugToKey } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { breadcrumbJsonLd } from '@/lib/seo'

export const revalidate = 60

type Props = { params: Promise<{ locale: string; category: string }>; searchParams: Promise<{ page?: string }> }

export async function generateMetadata({ params }: Props) {
  const { locale: l, category } = await params
  const locale = parseLocale(l)
  const dataKey = dataPageSlugToKey(category)
  if (dataKey) {
    const page = await getDataPage(locale, dataKey)
    return buildPageMetadata({ locale, title: page.title, description: page.intro, path: `/${category}`, urPath: `/ur/${category}` })
  }
  const cat = CATEGORIES.find((c) => c.slug === category)
  if (!cat) return {}
  const name = locale === 'ur' ? cat.ur : cat.en
  return buildPageMetadata({
    locale,
    title: name,
    path: `/${category}`,
    urPath: `/ur/${category}`,
  })
}

export default async function CategoryOrDataPage({ params, searchParams }: Props) {
  const { locale: l, category } = await params
  const locale = parseLocale(l) as Locale
  const pageNum = Math.max(1, parseInt((await searchParams).page ?? '1', 10) || 1)

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
  const mostRead = await getMostRead(locale, 5)
  const featured = feed.docs[0]
  const rest = feed.docs.slice(1)

  return (
    <div className="container-page py-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: d.nav.home, url: localePath(locale, '/') },
          { name, url: publicPath(locale, [category]) },
        ])}
      />
      <Breadcrumbs items={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: name }]} />
      <header className="mb-8 border-t-4 pt-4" style={{ borderColor: catMeta.color }}>
        <h1 className="font-display text-h1 font-semibold">{name}</h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          {locale === 'ur' ? `${name} سے متعلق تازہ ترین خبریں۔` : `Latest ${name} news and analysis for Pakistan.`}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {featured && (
            <div className="mb-8">
              <ArticleCard article={featured} locale={locale} variant="large" priority />
            </div>
          )}
          <div className="grid gap-6 sm:grid-cols-2">
            {rest.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
            ))}
          </div>
          <Pagination locale={locale} page={feed.page} totalPages={feed.totalPages} basePath={basePath} />
        </div>
        <aside className="lg:col-span-4">
          <h2 className="mb-4 font-semibold">{d.mostRead}</h2>
          {mostRead.map((a, i) => (
            <ArticleCard key={a.id} article={a} locale={locale} variant="numbered" index={i} />
          ))}
          <AdSlot locale={locale} size="rectangle" />
        </aside>
      </div>
    </div>
  )
}
