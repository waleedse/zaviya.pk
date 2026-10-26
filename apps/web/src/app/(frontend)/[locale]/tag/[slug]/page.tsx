import { getTagFeed } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { isThinTag } from '@/lib/tag-rules'
import { renderTagPage } from './tag-view'
import type { Locale } from '@zaviya/shared'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params
  const locale = parseLocale(l)
  const data = await getTagFeed(locale, slug, 1)
  if (!data) return {}
  const name = data.tag.name
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? `${name}: تازہ ترین خبریں` : `${name} News: Latest Updates`,
    description:
      locale === 'ur'
        ? `${name} سے متعلق تمام تازہ ترین خبریں اور اپڈیٹس زاویہ پر۔`
        : `All the latest news, updates and explainers about ${name} from Zaviya.`,
    enPath: `/tag/${slug}`,
    urPath: `/ur/tag/${slug}`,
    // Thin tag pages waste crawl budget until they collect a few stories.
    noindex: isThinTag(data.feed.totalDocs),
  })
}

export async function generateStaticParams() {
  return []
}

export default async function TagPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: l, slug } = await params
  return renderTagPage(parseLocale(l) as Locale, slug, 1)
}
