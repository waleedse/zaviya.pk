import { notFound } from 'next/navigation'
import { getAuthor, getMostRead } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { localePath, t } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Pagination } from '@/components/layout/Pagination'
import { ListingSidebar } from '@/components/layout/ListingSidebar'
import { AuthorAvatar } from '@/components/article/AuthorBox'
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
    enPath: `/author/${slug}`,
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
  const isUr = locale === 'ur'
  const mostRead = await getMostRead(locale, 6)

  return (
    <div className="pb-8">
      <section className="border-b border-border bg-accent-soft py-8 md:py-10">
        <div className="container-wide flex flex-wrap items-center gap-6">
          <AuthorAvatar author={author} size={104} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-accent">{isUr ? 'مصنف' : 'Author'}</p>
            <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3rem)] font-extrabold leading-tight">{author.name}</h1>
            {author.role && <p className="font-semibold text-fg-muted">{author.role}</p>}
            {author.bio && <p className="mt-2 max-w-[68ch] text-fg-muted">{author.bio}</p>}
            {author.socials && author.socials.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {author.socials.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer me" className="chip min-h-8 text-[13px] capitalize">
                    {s.platform}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-accent-line bg-surface px-5 py-3 text-center">
            <p className="font-display text-2xl font-extrabold tabular-nums">{author.articles.totalDocs}</p>
            <p className="text-xs font-semibold text-fg-subtle">{isUr ? 'خبریں' : 'stories'}</p>
          </div>
        </div>
      </section>
      <div className="container-wide grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <h2 className="mb-4 font-display text-2xl font-extrabold">{d.authorArticles} {author.name}</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {author.articles.docs.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
            ))}
          </div>
          <Pagination locale={locale} page={author.articles.page} totalPages={author.articles.totalPages} basePath={basePath} />
        </div>
        <ListingSidebar locale={locale} mostRead={mostRead} />
      </div>
    </div>
  )
}
