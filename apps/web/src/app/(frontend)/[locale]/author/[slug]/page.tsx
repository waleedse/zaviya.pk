import { notFound } from 'next/navigation'
import { getAuthor } from '@/lib/queries'
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
  const author = await getAuthor(locale, slug, 1)
  if (!author) return {}
  return buildPageMetadata({
    locale,
    title: author.name,
    description: author.bio,
    path: `/author/${slug}`,
    urPath: `/ur/author/${slug}`,
  })
}

export default async function AuthorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l) as Locale
  const page = Math.max(1, parseInt((await searchParams).page ?? '1', 10) || 1)
  const author = await getAuthor(locale, slug, page)
  if (!author) notFound()
  const d = t(locale)
  const basePath = localePath(locale, `/author/${slug}`)

  return (
    <div className="container-page py-8">
      <header className="mb-10 max-w-2xl">
        <h1 className="font-display text-h1 font-semibold">{author.name}</h1>
        {author.role && <p className="text-accent">{author.role}</p>}
        {author.bio && <p className="mt-4 text-lg text-fg-muted">{author.bio}</p>}
      </header>
      <h2 className="mb-4 font-display text-h2 font-semibold">{d.authorArticles}</h2>
      <div className="grid gap-6 sm:grid-cols-2">
        {author.articles.docs.map((a) => (
          <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
        ))}
      </div>
      <Pagination locale={locale} page={author.articles.page} totalPages={author.articles.totalPages} basePath={basePath} />
    </div>
  )
}
