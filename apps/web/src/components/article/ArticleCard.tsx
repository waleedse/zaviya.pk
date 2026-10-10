import Image from 'next/image'
import Link from 'next/link'
import type { ArticleCard as ArticleCardType, Locale } from '@zaviya/shared'
import { Kicker } from '@/components/article/Kicker'
import { LiveBadge } from '@/components/article/LiveBadge'
import { TimeAgo } from '@/components/article/TimeAgo'
import { cn } from '@/lib/utils'

type Variant = 'hero' | 'large' | 'medium' | 'compact' | 'list' | 'numbered'

export function ArticleCard({
  article,
  locale,
  variant = 'medium',
  index,
  priority,
}: {
  article: ArticleCardType
  locale: Locale
  variant?: Variant
  index?: number
  priority?: boolean
}) {
  const img = article.image

  if (variant === 'hero') {
    return (
      <article className="group col-span-full lg:col-span-8">
        <Link href={article.href} className="block space-y-4">
          {img && (
            <div className="relative aspect-video overflow-hidden rounded-[var(--radius-image)] bg-surface-2">
              <Image src={img.url} alt={img.alt} fill priority={priority} className="object-cover transition-transform duration-200 group-hover:scale-[1.02]" sizes="(max-width:1024px) 100vw, 66vw" />
            </div>
          )}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Kicker category={article.category} locale={locale} />
              {article.isLive && <LiveBadge locale={locale} />}
            </div>
            <h2 className="font-display text-[var(--text-display)] font-semibold leading-[1.05] line-clamp-headline">{article.title}</h2>
            {article.dek && <p className="text-lg text-fg-muted line-clamp-2">{article.dek}</p>}
            <ArticleMeta article={article} locale={locale} />
          </div>
        </Link>
      </article>
    )
  }

  if (variant === 'numbered') {
    return (
      <article className="group flex gap-4 border-b border-border py-4 last:border-0">
        <span className="font-display text-4xl font-bold tabular-nums text-surface-2 [dir=rtl]:font-sans" aria-hidden>
          {(index ?? 0) + 1}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={article.href} className="space-y-1">
            <Kicker category={article.category} locale={locale} />
            <h3 className="font-display text-h3 font-semibold line-clamp-headline group-hover:text-accent">{article.title}</h3>
            <ArticleMeta article={article} locale={locale} small />
          </Link>
        </div>
      </article>
    )
  }

  if (variant === 'list') {
    return (
      <article className="group flex gap-4 border-s-2 border-transparent py-4 ps-4 transition-colors hover:border-accent">
        <div className="w-16 shrink-0 text-end text-sm tabular-nums text-fg-muted">
          <TimeAgo iso={article.publishedAt} locale={locale} />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={article.href} className="space-y-1">
            <Kicker category={article.category} locale={locale} />
            <h3 className="font-display font-semibold line-clamp-headline group-hover:text-accent">{article.title}</h3>
          </Link>
        </div>
      </article>
    )
  }

  if (variant === 'compact') {
    return (
      <article className="group w-44 shrink-0 snap-start">
        <Link href={article.href} className="block space-y-2">
          {img && (
            <div className="relative aspect-square overflow-hidden rounded-[var(--radius-image)] bg-surface-2">
              <Image src={img.url} alt={img.alt} fill className="object-cover" sizes="176px" />
            </div>
          )}
          <h3 className="text-sm font-semibold line-clamp-3 group-hover:text-accent">{article.title}</h3>
        </Link>
      </article>
    )
  }

  const isLarge = variant === 'large'
  return (
    <article className={cn('group', isLarge && 'md:col-span-2')}>
      <Link href={article.href} className="block space-y-3">
        {img && (
          <div className={cn('relative overflow-hidden rounded-[var(--radius-image)] bg-surface-2', isLarge ? 'aspect-video' : 'aspect-video')}>
            <Image
              src={img.url}
              alt={img.alt}
              fill
              priority={priority}
              className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              sizes={isLarge ? '(max-width:768px) 100vw, 50vw' : '(max-width:768px) 100vw, 33vw'}
            />
            {article.isLive && (
              <div className="absolute start-3 top-3">
                <LiveBadge locale={locale} />
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Kicker category={article.category} locale={locale} />
          <h3 className={cn('font-display font-semibold line-clamp-headline group-hover:text-accent', isLarge ? 'text-h2' : 'text-h3')}>{article.title}</h3>
          {article.dek && isLarge && <p className="text-fg-muted line-clamp-2">{article.dek}</p>}
          <ArticleMeta article={article} locale={locale} small />
        </div>
      </Link>
    </article>
  )
}

function ArticleMeta({ article, locale, small }: { article: ArticleCardType; locale: Locale; small?: boolean }) {
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 text-fg-muted', small ? 'text-sm' : 'text-sm')}>
      {article.author && <span>{article.author.name}</span>}
      <span aria-hidden>·</span>
      <TimeAgo iso={article.publishedAt} locale={locale} />
      {article.readingTime != null && (
        <>
          <span aria-hidden>·</span>
          <span>{article.readingTime} min</span>
        </>
      )}
    </p>
  )
}
