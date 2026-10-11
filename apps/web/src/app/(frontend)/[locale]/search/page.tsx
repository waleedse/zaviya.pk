import { SearchClient } from '@/components/search/SearchClient'
import { parseLocale } from '@/lib/locale'
import { t } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'
import { search } from '@/lib/queries'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({ locale, title: t(locale).search, enPath: '/search', urPath: '/ur/search', noindex: true })
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const locale = parseLocale((await params).locale)
  const { q = '', page = '1' } = await searchParams
  const pageNum = parseInt(page, 10) || 1
  const data = q.trim() ? await search(locale, q, pageNum) : { docs: [] }
  return <SearchClient locale={locale} initialQuery={q} results={data.docs} />
}
