import Link from 'next/link'
import type { CategoryRef } from '@zaviya/shared'
import type { Locale } from '@zaviya/shared'
import { localePath } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function Kicker({ category, locale, className }: { category: CategoryRef; locale: Locale; className?: string }) {
  const href = localePath(locale, `/${category.slug}`)
  return (
    <Link
      href={href}
      className={cn('kicker-text hover:underline', className)}
      style={{ color: category.color }}
    >
      {category.name}
    </Link>
  )
}
