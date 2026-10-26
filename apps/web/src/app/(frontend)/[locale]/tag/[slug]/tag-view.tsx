import { notFound } from 'next/navigation'
import { getMostRead, getTagFeed } from '@/lib/queries'
import { localePath, t } from '@/lib/i18n'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Pagination } from '@/components/layout/Pagination'
import { PageHero } from '@/components/layout/PageHero'
import { ListingSidebar } from '@/components/layout/ListingSidebar'
import { Hash } from 'lucide-react'
import type { Locale } from '@zaviya/shared'

/** Tag listing (page 1 at /tag/[slug], page n at /tag/[slug]/page/[n]; proxy.ts rewrites ?page=n so no searchParams). */
export async function renderTagPage(locale: Locale, slug: string, page: number) {
  const data = await getTagFeed(locale, slug, page)
  if (!data) notFound()
  const basePath = localePath(locale, `/tag/${slug}`)
  const d = t(locale)
  const isUr = locale === 'ur'
  const mostRead = await getMostRead(locale, 6)

  return (
    <div className="pb-8">
      <PageHero
        title={data.tag.name}
        description={isUr ? `${data.tag.name} سے متعلق تمام تازہ ترین خبریں۔` : `All the latest news, updates and explainers about ${data.tag.name}.`}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: d.tags }, { label: data.tag.name }]}
        icon={Hash}
        color="#b45309"
        eyebrow={isUr ? 'موضوع' : 'Topic'}
        stats={[{ label: isUr ? 'خبریں' : 'stories', value: data.feed.totalDocs }]}
      />
      <div className="container-wide grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {data.feed.docs.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
            ))}
          </div>
          <Pagination locale={locale} page={data.feed.page} totalPages={data.feed.totalPages} basePath={basePath} />
        </div>
        <ListingSidebar locale={locale} mostRead={mostRead} />
      </div>
    </div>
  )
}
