import { notFound } from 'next/navigation'
import type { Locale } from '@zaviya/shared'
import { LatestList } from '@/components/article/LatestList'
import { Pagination } from '@/components/layout/Pagination'
import { PageHero } from '@/components/layout/PageHero'
import { getLatestLinks } from '@/lib/queries'
import { localePath, t } from '@/lib/i18n'
import { Newspaper } from 'lucide-react'

/** /latest (page 1) and /latest/page/[n]: every published story, newest first, 50 headlines per page (ZAV-221). */
export async function renderLatestPage(locale: Locale, pageNum: number) {
  const feed = await getLatestLinks(locale, null, pageNum)
  if (pageNum > 1 && feed.docs.length === 0) notFound()
  const d = t(locale)
  const isUr = locale === 'ur'
  return (
    <div className="pb-8">
      <PageHero
        title={isUr ? 'تازہ ترین خبریں' : 'Latest news'}
        description={isUr ? 'زاویہ پر شائع ہونے والی تمام خبریں، نئی سے پرانی۔' : 'Every story on Zaviya News, newest first.'}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: isUr ? 'تازہ ترین' : 'Latest' }]}
        icon={Newspaper}
        color="#0f766e"
        eyebrow={isUr ? 'فہرست' : 'All stories'}
        stats={feed.totalDocs ? [{ label: isUr ? 'خبریں' : 'stories', value: feed.totalDocs }] : undefined}
      />
      <div className="container-wide pt-8">
        <LatestList locale={locale} items={feed.docs} title={isUr ? 'تازہ ترین خبریں' : 'Latest news'} />
        <Pagination locale={locale} page={feed.page} totalPages={feed.totalPages} basePath={localePath(locale, '/latest')} />
      </div>
    </div>
  )
}
