import { notFound } from 'next/navigation'
import { getArticleBySlug } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { buildWebStoryHtml, canBuildWebStory } from '@/lib/web-story'

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l)
  const article = await getArticleBySlug(locale, slug)
  if (!article || !canBuildWebStory(article)) notFound()

  const publicPath = locale === 'ur' ? article.href : article.href.replace(/^\/ur/, '') || article.href
  const html = buildWebStoryHtml(article, locale, publicPath)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
