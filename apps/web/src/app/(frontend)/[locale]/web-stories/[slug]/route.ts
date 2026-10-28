import { notFound } from 'next/navigation'
import { getArticleBySlug, getStoryDigests } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { canBuildWebStory } from '@/lib/web-story'
import { buildBreakingStory, buildDigestStory, DIGEST_MIN, parseDailyStorySlug, STORIES_CACHE_CONTROL, WEB_STORY_DAYS } from '@/lib/web-stories'

type Props = { params: Promise<{ locale: string; slug: string }> }

/** /web-stories/<slug> (ZAV-242): daily-YYYY-MM-DD digest, or the slug of a recent breaking article. English only. */
export async function GET(_request: Request, { params }: Props) {
  const { locale: l, slug } = await params
  if (parseLocale(l) !== 'en') notFound()

  const date = parseDailyStorySlug(slug)
  let html: string
  if (date) {
    const digest = (await getStoryDigests(WEB_STORY_DAYS + 1)).find((d) => d.date === date)
    if (!digest || digest.top.length < DIGEST_MIN) notFound()
    html = buildDigestStory(digest)
  } else {
    const article = await getArticleBySlug('en', slug)
    const recent = article && Date.now() - new Date(article.publishedAt).getTime() < (WEB_STORY_DAYS + 1) * 24 * 3_600_000
    if (!article || !recent || !canBuildWebStory(article) || !(article.isBreaking || article.priority === 'breaking')) notFound()
    html = buildBreakingStory(article)
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': STORIES_CACHE_CONTROL },
  })
}
