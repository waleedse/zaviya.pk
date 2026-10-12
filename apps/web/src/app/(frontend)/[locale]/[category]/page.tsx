import { renderCategoryPage } from './category-view'
import { CATEGORIES, type Locale } from '@zaviya/shared'
import { getDataPage } from '@/lib/queries'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata, dataPageSlugToKey, SECTION_SEO } from '@/lib/seo'

export const revalidate = 60

type Props = { params: Promise<{ locale: string; category: string }> }

// Render on first request, then serve from the ISR cache. Page 2+ is /[category]/page/[n] (proxy.ts rewrites ?page=n)
export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: Props) {
  const { locale: l, category } = await params
  const locale = parseLocale(l)
  const dataKey = dataPageSlugToKey(category)
  if (dataKey) {
    const page = await getDataPage(locale, dataKey)
    return buildPageMetadata({
      locale,
      title: `${page.title}${page.headline ? ` (${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })})` : ''}`,
      description: (page.intro ?? page.source).slice(0, 160),
      enPath: `/${category}`,
      urPath: `/ur/${category}`,
      // An empty rates page is thin content: keep it out of Google until real data exists.
      noindex: !page.headline,
    })
  }
  const cat = CATEGORIES.find((c) => c.slug === category)
  if (!cat) return {}
  const seo = SECTION_SEO[category]?.[locale]
  return buildPageMetadata({
    locale,
    title: seo?.title ?? (locale === 'ur' ? cat.ur : cat.en),
    description: seo?.description,
    enPath: `/${category}`,
    urPath: `/ur/${category}`,
  })
}

export default async function CategoryOrDataPage({ params }: Props) {
  const { locale: l, category } = await params
  return renderCategoryPage(parseLocale(l) as Locale, category, 1)
}
