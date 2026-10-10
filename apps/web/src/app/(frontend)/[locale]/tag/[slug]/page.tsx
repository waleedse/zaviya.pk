import { getTagFeed } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Pagination } from '@/components/layout/Pagination'
import type { Locale } from '@zaviya/shared'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l)
  return buildPageMetadata({ locale, title: `#${slug}`, path: `/tag/${slug}`, urPath: `/ur/tag/${slug}` })
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l) as Locale
  const page = Math.max(1, parseInt((await searchParams).page ?? '1', 10) || 1)
  const data = await getTagFeed(locale, slug, page)
  if (!data) return null
  const basePath = localePath(locale, `/tag/${slug}`)

  return (
    <div className="container-page py-8">
      <h1 className="font-display text-h1 font-semibold">#{data.tag.name}</h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data.feed.docs.map((a) => (
          <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
        ))}
      </div>
      <Pagination locale={locale} page={data.feed.page} totalPages={data.feed.totalPages} basePath={basePath} />
    </div>
  )
}
