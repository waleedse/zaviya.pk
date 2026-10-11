import Link from 'next/link'
import type { CategoryRef, Locale } from '@zaviya/shared'
import { localePath } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Category label. Inside a card link it must stay a span (no nested links). */
export function Kicker({
  category,
  locale,
  className,
  asLink = false,
}: {
  category: CategoryRef
  locale: Locale
  className?: string
  asLink?: boolean
}) {
  const cls = cn('kicker-text angle', className)
  if (asLink) {
    return (
      <Link href={localePath(locale, `/${category.slug}`)} className={cn(cls, 'hover:underline')} style={{ color: category.color }}>
        {category.name}
      </Link>
    )
  }
  return (
    <span className={cls} style={{ color: category.color }}>
      {category.name}
    </span>
  )
}
