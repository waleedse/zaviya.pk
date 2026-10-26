import Link from 'next/link'
import type { Locale } from '@zaviya/shared'
import type { LatestLink } from '@/lib/queries'
import { localePath } from '@/lib/i18n'

const when = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  })

/**
 * Plain list of headlines, each a real <a href> in the server HTML. Crawlers follow it without running scripts, so every
 * new article is one click from the page that links it (ZAV-221).
 */
export function LatestList({
  locale,
  items,
  title,
  moreHref,
  moreLabel,
}: {
  locale: Locale
  items: LatestLink[]
  title: string
  moreHref?: string
  moreLabel?: string
}) {
  if (!items.length) return null
  return (
    <section aria-label={title} className="card-surface p-5">
      <h2 className="font-display text-[1.4rem] font-extrabold">{title}</h2>
      <ol className="mt-3 divide-y divide-border">
        {items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
            <Link href={a.href} className="min-w-0 flex-1 basis-[18rem] font-semibold hover:text-accent">
              {a.title}
            </Link>
            <span className="text-xs text-fg-muted">
              {a.category} · <time dateTime={a.publishedAt}>{when(a.publishedAt, locale)}</time>
            </span>
          </li>
        ))}
      </ol>
      {moreHref && (
        <Link href={localePath(locale, moreHref)} className="mt-4 inline-block text-sm font-bold text-accent hover:underline">
          {moreLabel}
        </Link>
      )}
    </section>
  )
}
