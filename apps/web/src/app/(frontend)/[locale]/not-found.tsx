import Link from 'next/link'
import { getHomeFeed } from '@/lib/queries'
import { AngleMark } from '@/components/brand/Logo'
import { TOOLS } from '@/components/home/tools'
import { ArticleCard } from '@/components/article/ArticleCard'
import { localePath, t } from '@/lib/i18n'
import type { Locale } from '@zaviya/shared'

export default async function NotFound({ params }: { params?: Promise<{ locale: string }> }) {
  const raw = params ? (await params).locale : 'en'
  const locale = (raw === 'ur' ? 'ur' : 'en') as Locale
  const d = t(locale)
  const feed = await getHomeFeed(locale)

  const isUr = locale === 'ur'
  return (
    <div className="container-wide py-14">
      <div className="card-surface mx-auto max-w-2xl p-8 text-center md:p-12">
        <AngleMark className="mx-auto mb-6 h-20 w-20" />
        <p className="font-display text-6xl font-extrabold text-accent">404</p>
        <h1 className="mt-2 font-display text-h1 font-extrabold">{d.notFound.title}</h1>
        <p className="mt-2 text-fg-muted">{d.notFound.desc}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={localePath(locale, '/')} className="inline-flex h-12 items-center rounded-2xl bg-accent px-6 font-bold text-accent-fg">
            {isUr ? 'ہوم پیج' : 'Go to the homepage'}
          </Link>
          <Link href={localePath(locale, '/search')} className="inline-flex h-12 items-center rounded-2xl border border-border bg-surface px-6 font-bold hover:border-accent">
            {d.search}
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {TOOLS.slice(0, 5).map((tool) => (
            <Link key={tool.path} href={localePath(locale, tool.path)} className="chip">
              <tool.icon className="h-4 w-4 text-accent" aria-hidden />
              {isUr ? tool.ur : tool.en}
            </Link>
          ))}
        </div>
      </div>
      <section className="mt-14">
        <h2 className="mb-4 font-display text-2xl font-extrabold">{d.latest}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {feed.latest.slice(0, 6).map((a) => (
            <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
          ))}
        </div>
      </section>
    </div>
  )
}
