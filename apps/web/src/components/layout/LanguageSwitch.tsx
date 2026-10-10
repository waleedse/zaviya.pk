import Link from 'next/link'
import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function LanguageSwitch({
  locale,
  href,
  className,
}: {
  locale: Locale
  href: string
  className?: string
}) {
  const d = t(locale)
  const label = locale === 'en' ? d.readInUrdu : d.readInEnglish
  return (
    <Link
      href={href}
      className={cn(
        'rounded-[var(--radius-pill)] border border-border px-3 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-accent',
        className,
      )}
      hrefLang={locale === 'en' ? 'ur' : 'en'}
    >
      {label}
    </Link>
  )
}
