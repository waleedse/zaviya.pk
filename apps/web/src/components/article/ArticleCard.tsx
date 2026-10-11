import Link from 'next/link'
import type { ArticleCard as ArticleCardType, Locale } from '@zaviya/shared'
import { CardImage } from '@/components/article/CardImage'
import { Kicker } from '@/components/article/Kicker'
import { LiveBadge } from '@/components/article/LiveBadge'
import { TimeAgo } from '@/components/article/TimeAgo'
import { cn } from '@/lib/utils'

type Variant = 'lead' | 'hero' | 'large' | 'medium' | 'side' | 'headline' | 'compact' | 'list' | 'numbered' | 'overlay' | 'row'

/**
 * One component for every story teaser. Each variant is a single link (no nested anchors),
 * with the kicker rendered as plain text inside it.
 */
export function ArticleCard({
  article,
  locale,
  variant = 'medium',
  index,
  priority,
  className,
}: {
  article: ArticleCardType
  locale: Locale
  variant?: Variant
  index?: number
  priority?: boolean
  className?: string
}) {
  const isUr = locale === 'ur'

  if (variant === 'lead' || variant === 'hero') {
    return (
      <article className={cn('group card-lift p-3 md:p-3.5', className)}>
        <Link href={article.href} className="block">
          <div className="relative">
            <CardImage article={article} locale={locale} priority={priority} aspect="aspect-[16/9]" sizes="(max-width:1024px) 100vw, 60vw" />
            <span className="absolute start-3 top-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#0b1220] rtl:tracking-normal">
              <span className="h-2 w-2 rounded-full" style={{ background: article.category.color }} aria-hidden />
              {article.category.name}
            </span>
            {article.isLive && (
              <span className="absolute end-3 top-3">
                <LiveBadge locale={locale} />
              </span>
            )}
          </div>
          <div className="space-y-3 px-2 pb-2 pt-5 md:px-3">
            <h2 className={cn('font-display text-[clamp(1.9rem,1.3rem+1.5vw,2.75rem)] font-extrabold', isUr ? 'leading-[1.6]' : 'leading-[1.06]')}>
              <span className="headline-hover">{article.title}</span>
            </h2>
            {article.dek && <p className="max-w-[62ch] text-[1.08em] leading-relaxed text-fg-muted line-clamp-3">{article.dek}</p>}
            <ArticleMeta article={article} locale={locale} withAvatar />
          </div>
        </Link>
      </article>
    )
  }

  if (variant === 'overlay') {
    return (
      <article className={cn('group relative overflow-hidden rounded-[var(--radius-card)] bg-ink', className)}>
        <Link href={article.href} className="block">
          <CardImage article={article} locale={locale} priority={priority} aspect="aspect-[9/15]" sizes="220px" showLabel={false} className="rounded-none" />
          <span className="absolute inset-x-3 top-3 flex gap-1" aria-hidden>
            <span className="h-[3px] flex-1 rounded bg-white" />
            <span className="h-[3px] flex-1 rounded bg-white/45" />
            <span className="h-[3px] flex-1 rounded bg-white/45" />
            <span className="h-[3px] flex-1 rounded bg-white/45" />
          </span>
          <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-ink p-3.5 text-white">
            <span className="kicker-text text-emerald-300">{article.category.name}</span>
            <h3 className={cn('font-display text-base font-bold line-clamp-3', isUr ? 'leading-[1.7]' : 'leading-snug')}>{article.title}</h3>
          </div>
        </Link>
      </article>
    )
  }

  if (variant === 'side') {
    // Image left, text right: dense secondary stories
    return (
      <article className={cn('group', className)}>
        <Link href={article.href} className="card-lift grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 p-3 sm:grid-cols-[128px_minmax(0,1fr)]">
          <CardImage article={article} locale={locale} aspect="aspect-[4/3]" className="img-zoom" sizes="128px" showLabel={false} />
          <div className="min-w-0 space-y-1.5">
            <Kicker category={article.category} locale={locale} />
            <h3 className={cn('font-display text-[1.05rem] font-bold line-clamp-3', isUr ? 'leading-[1.75]' : 'leading-snug')}>
              <span className="headline-hover">{article.title}</span>
            </h3>
            <p className="text-xs text-fg-subtle">
              <TimeAgo iso={article.publishedAt} locale={locale} />
            </p>
          </div>
        </Link>
      </article>
    )
  }

  if (variant === 'row') {
    // Text only row with a coloured dot: used for long lists of extra stories
    return (
      <article className={cn('group', className)}>
        <Link href={article.href} className="flex gap-3 py-3">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: article.category.color }} aria-hidden />
          <span className="min-w-0 space-y-1">
            <span className={cn('block font-display text-[1rem] font-bold', isUr ? 'leading-[1.8]' : 'leading-snug')}>
              <span className="headline-hover">{article.title}</span>
            </span>
            <span className="block text-xs text-fg-subtle">
              {article.category.name} · <TimeAgo iso={article.publishedAt} locale={locale} />
            </span>
          </span>
        </Link>
      </article>
    )
  }

  if (variant === 'headline') {
    return (
      <article className={cn('group py-3', className)}>
        <Link href={article.href} className="block space-y-1">
          <h3 className={cn('font-display text-[1.05rem] font-bold', isUr ? 'leading-[1.8]' : 'leading-snug')}>
            <span className="headline-hover">{article.title}</span>
          </h3>
          <p className="text-xs text-fg-subtle">
            <TimeAgo iso={article.publishedAt} locale={locale} />
          </p>
        </Link>
      </article>
    )
  }

  if (variant === 'numbered') {
    return (
      <article className={cn('group flex gap-4 py-4', className)}>
        <span className="w-9 shrink-0 font-display text-[2.4rem] font-extrabold leading-[0.9] text-emerald-200 tabular-nums dark:text-emerald-800" aria-hidden>
          {(index ?? 0) + 1}
        </span>
        <Link href={article.href} className="min-w-0 flex-1 space-y-1">
          <h3 className={cn('font-display text-[1.05rem] font-bold line-clamp-3', isUr ? 'leading-[1.75]' : 'leading-snug')}>
            <span className="headline-hover">{article.title}</span>
          </h3>
          <p className="text-xs text-fg-subtle">
            {article.category.name} · <TimeAgo iso={article.publishedAt} locale={locale} />
          </p>
        </Link>
      </article>
    )
  }

  if (variant === 'list') {
    return (
      <article className={cn('group grid grid-cols-[64px_minmax(0,1fr)] gap-3 border-t border-border py-3 first:border-t-0', className)}>
        <TimeAgo iso={article.publishedAt} locale={locale} className="pt-0.5 text-xs font-bold tabular-nums text-fg-subtle" />
        <Link href={article.href} className="block min-w-0 space-y-1">
          <span className="kicker-text block" style={{ color: article.category.color }}>
            {article.category.name}
          </span>
          <h3 className={cn('text-[0.97rem] font-semibold', isUr ? 'leading-[1.8]' : 'leading-snug')}>
            <span className="headline-hover">{article.title}</span>
          </h3>
        </Link>
      </article>
    )
  }

  if (variant === 'compact') {
    return (
      <article className={cn('group w-44 shrink-0 snap-start', className)}>
        <Link href={article.href} className="block space-y-2">
          <CardImage article={article} locale={locale} aspect="aspect-[9/14]" sizes="176px" />
          <h3 className="text-sm font-semibold leading-snug line-clamp-3">{article.title}</h3>
        </Link>
      </article>
    )
  }

  const isLarge = variant === 'large'
  return (
    <article className={cn('group h-full', className)}>
      <Link href={article.href} className="card-lift flex h-full flex-col p-3">
        <div className="relative">
          <CardImage
            article={article}
            locale={locale}
            priority={priority}
            aspect={isLarge ? 'aspect-[16/9]' : 'aspect-[16/10]'}
            className="img-zoom"
            sizes={isLarge ? '(max-width:768px) 100vw, 50vw' : '(max-width:768px) 100vw, 25vw'}
          />
          {article.isLive && (
            <div className="absolute start-3 top-3">
              <LiveBadge locale={locale} />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 px-1.5 pb-1.5 pt-3.5">
          <Kicker category={article.category} locale={locale} />
          <h3
            className={cn(
              'font-display font-bold line-clamp-3',
              isLarge ? 'text-h2' : 'text-[1.12rem]',
              isUr ? 'leading-[1.75]' : 'leading-tight',
            )}
          >
            <span className="headline-hover">{article.title}</span>
          </h3>
          {article.dek && isLarge && <p className="text-fg-muted line-clamp-2">{article.dek}</p>}
          <div className="mt-auto">
            <ArticleMeta article={article} locale={locale} small />
          </div>
        </div>
      </Link>
    </article>
  )
}

function ArticleMeta({ article, locale, small, withAvatar }: { article: ArticleCardType; locale: Locale; small?: boolean; withAvatar?: boolean }) {
  const initials = article.author?.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-fg-subtle', small ? 'text-xs' : 'text-sm')}>
      {withAvatar && article.author && (
        <span className="me-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg" aria-hidden>
          {initials}
        </span>
      )}
      {article.author && <span className="font-semibold text-fg-muted">{article.author.name}</span>}
      {article.author && <span aria-hidden>·</span>}
      <TimeAgo iso={article.publishedAt} locale={locale} />
      {article.readingTime != null && article.readingTime > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>
            {article.readingTime} {locale === 'ur' ? 'منٹ' : 'min read'}
          </span>
        </>
      )}
    </div>
  )
}
