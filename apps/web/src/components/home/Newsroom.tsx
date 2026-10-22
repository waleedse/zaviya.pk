import { ArrowRight, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ArticleCard as Card, Locale } from '@zaviya/shared'
import { CardImage } from '@/components/article/CardImage'
import { LiveBadge } from '@/components/article/LiveBadge'
import { TimeAgo } from '@/components/article/TimeAgo'
import { localePath, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const lh = (locale: Locale, en: string, ur = 'leading-[1.75]') => (locale === 'ur' ? ur : en)

/** Category label in the category colour (plain text: it sits inside card links). */
export function Label({ article, className }: { article: Card; className?: string }) {
  return (
    <span className={cn('kicker-text block', className)} style={{ color: article.category.color }}>
      {article.category.name}
    </span>
  )
}

/** Section heading: a tab cut at the Zaviya angle, in the section colour. */
export function DeskHead({ title, href, more, color, icon: Icon }: { title: string; href: string; more: string; color: string; icon?: LucideIcon }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4 border-b-2" style={{ borderColor: color }}>
      <h2 className="desk-tab" style={{ background: color }}>
        {Icon && <Icon className="h-[18px] w-[18px]" aria-hidden />}
        {title}
      </h2>
      <Link href={href} className="mb-2 inline-flex shrink-0 items-center gap-1 text-sm font-bold text-fg-muted hover:text-accent">
        {more}
        <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
      </Link>
    </header>
  )
}

/** The lead: the headline is written on the picture, so the slot holds the story in less height. */
export function LeadStory({ article, locale, priority }: { article: Card; locale: Locale; priority?: boolean }) {
  const isUr = locale === 'ur'
  return (
    <article className="group relative overflow-hidden rounded-[var(--radius-card)] bg-ink">
      <Link href={article.href} className="block">
        <CardImage
          article={article}
          locale={locale}
          priority={priority}
          aspect="aspect-[4/5] sm:aspect-[16/10]"
          sizes="(max-width:1024px) 100vw, 860px"
          showLabel={false}
          className="rounded-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 from-0% via-black/35 via-30% to-transparent to-55%" aria-hidden />
        {article.isLive && (
          <span className="absolute end-4 top-4">
            <LiveBadge locale={locale} />
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-4 text-white md:p-6">
          <span className="angle-tag" style={{ background: article.category.color }}>
            {article.category.name}
            {article.isBreaking ? (isUr ? ' · بریکنگ' : ' · Breaking') : ''}
          </span>
          <h2 className={cn('max-w-[28ch] font-display text-[clamp(1.4rem,1.05rem+1.2vw,2.15rem)] font-extrabold [text-shadow:0_2px_16px_rgba(0,0,0,.5)]', lh(locale, 'leading-[1.1]', 'leading-[1.6]'))}>
            <span className="headline-hover">{article.title}</span>
          </h2>
          <p className="text-sm text-white/75">
            {article.author && <b className="font-semibold text-white">{article.author.name} · </b>}
            <TimeAgo iso={article.publishedAt} locale={locale} />
            {article.readingTime ? ` · ${article.readingTime} ${isUr ? 'منٹ' : 'min read'}` : ''}
          </p>
        </div>
      </Link>
    </article>
  )
}

/** A story with its picture on top; `size` sets the headline. */
export function PictureStory({ article, locale, size = 'md', dek, className }: { article: Card; locale: Locale; size?: 'sm' | 'md' | 'lg'; dek?: boolean; className?: string }) {
  return (
    <article className={cn('group h-full', className)}>
      <Link href={article.href} className="flex h-full flex-col gap-2.5">
        <CardImage article={article} locale={locale} aspect="aspect-[16/10]" className="img-zoom" sizes="(max-width:768px) 80vw, 360px" showLabel={false} />
        <Label article={article} />
        <h3
          className={cn(
            'font-display font-bold',
            size === 'lg' ? 'text-[1.45rem] font-extrabold' : size === 'md' ? 'text-[1.1rem]' : 'text-[1rem]',
            lh(locale, size === 'lg' ? 'leading-tight' : 'leading-snug'),
          )}
        >
          <span className="headline-hover">{article.title}</span>
        </h3>
        {dek && article.dek && <p className="line-clamp-2 text-[0.97rem] leading-relaxed text-fg-muted">{article.dek}</p>}
        <TimeAgo iso={article.publishedAt} locale={locale} className="mt-auto block text-xs text-fg-subtle" />
      </Link>
    </article>
  )
}

/** Headline beside a small picture: the dense list used inside every section. */
export function ThumbStory({ article, locale, label, tone = 'light' }: { article: Card; locale: Locale; label?: boolean; tone?: 'light' | 'dark' }) {
  return (
    <article className="group">
      <Link href={article.href} className="grid grid-cols-[minmax(0,1fr)_96px] items-start gap-3.5 py-3.5">
        <span className="min-w-0 space-y-1">
          {label && <Label article={article} />}
          <span className={cn('block font-display text-[1rem] font-bold line-clamp-3', lh(locale, 'leading-snug', 'leading-[1.8]'), tone === 'dark' && 'text-ink-fg')}>
            <span className="headline-hover">{article.title}</span>
          </span>
          <TimeAgo iso={article.publishedAt} locale={locale} className={cn('block text-xs', tone === 'dark' ? 'text-ink-muted' : 'text-fg-subtle')} />
        </span>
        <CardImage article={article} locale={locale} aspect="aspect-[4/3]" sizes="96px" showLabel={false} className="img-zoom" />
      </Link>
    </article>
  )
}

/** Newest stories as a timeline. */
export function Wire({ locale, items }: { locale: Locale; items: Card[] }) {
  const d = t(locale)
  return (
    <section aria-label={d.latest}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 font-display text-[1.25rem] font-extrabold">
          <span className="live-dot" aria-hidden />
          {d.latest}
        </h2>
        <Link href={localePath(locale, '/live')} className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline">
          {locale === 'ur' ? 'لائیو فیڈ' : 'Live feed'}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
      <ol className="border-s border-border ps-5">
        {items.map((a) => (
          <li key={a.id} className="group relative py-2">
            <span className="absolute -start-[25px] top-[0.95rem] h-2 w-2 rounded-full ring-4 ring-surface" style={{ background: a.category.color }} aria-hidden />
            <Link href={a.href} className="block">
              <TimeAgo iso={a.publishedAt} locale={locale} className="block text-xs font-bold text-fg-subtle" />
              <span className={cn('block font-display text-[0.97rem] font-bold line-clamp-3', lh(locale, 'leading-snug', 'leading-[1.8]'))}>
                <span className="headline-hover">{a.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The editor's ranked top stories. */
export function TopList({ locale, items }: { locale: Locale; items: Card[] }) {
  return (
    <section aria-label={locale === 'ur' ? 'آج کی اہم خبریں' : 'Top stories today'} className="rounded-[18px] border border-accent-line bg-accent-soft p-4">
      <h2 className="mb-1 font-display text-[1.25rem] font-extrabold">{locale === 'ur' ? 'آج کی اہم خبریں' : 'Top stories today'}</h2>
      <ol>
        {items.map((a, i) => (
          <li key={a.id} className="border-t border-accent-line first:border-t-0">
            <Link href={a.href} className="group flex gap-3 py-2.5">
              <span className="w-6 shrink-0 font-display text-[1.75rem] font-extrabold leading-[0.95] text-accent tabular-nums" aria-hidden>
                {i + 1}
              </span>
              <span className={cn('font-display text-[0.97rem] font-bold', lh(locale, 'leading-snug', 'leading-[1.8]'))}>
                <span className="headline-hover">{a.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
