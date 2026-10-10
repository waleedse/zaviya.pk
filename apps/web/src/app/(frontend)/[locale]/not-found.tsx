import Link from 'next/link'
import { getHomeFeed } from '@/lib/queries'
import { AngleMark } from '@/components/brand/Logo'
import { ArticleCard } from '@/components/article/ArticleCard'
import { localePath, t } from '@/lib/i18n'
import type { Locale } from '@zaviya/shared'

export default async function NotFound({ params }: { params?: Promise<{ locale: string }> }) {
  const raw = params ? (await params).locale : 'en'
  const locale = (raw === 'ur' ? 'ur' : 'en') as Locale
  const d = t(locale)
  const feed = await getHomeFeed(locale)

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-lg text-center">
        <AngleMark className="mx-auto mb-6 h-20 w-20 opacity-50" />
        <h1 className="font-display text-h1 font-semibold">{d.notFound.title}</h1>
        <p className="mt-2 text-fg-muted">{d.notFound.desc}</p>
        <Link href={localePath(locale, '/search')} className="mt-6 inline-flex min-h-11 items-center rounded-md bg-accent px-6 text-accent-fg">
          {d.search}
        </Link>
      </div>
      <section className="mt-16">
        <h2 className="mb-4 font-display text-h2 font-semibold">{d.latest}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feed.latest.slice(0, 6).map((a) => (
            <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
          ))}
        </div>
      </section>
    </div>
  )
}
