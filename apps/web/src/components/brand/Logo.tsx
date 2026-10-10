import Link from 'next/link'
import { SITE, type Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'
import { localePath } from '@/lib/i18n'

export function Logo({ locale, className }: { locale: Locale; className?: string }) {
  const home = localePath(locale, '/')
  const isUr = locale === 'ur'
  return (
    <Link href={home} className={cn('group inline-flex items-center gap-2', className)} aria-label={SITE.name}>
      {isUr ? (
        <span className="font-display text-2xl font-semibold tracking-tight">{SITE.nameUr}</span>
      ) : (
        <span className="inline-flex items-baseline font-sans text-2xl font-semibold lowercase tracking-tight">
          <span className="relative text-accent">
            z
            <svg className="absolute -start-0.5 -top-1 h-5 w-5 text-accent" viewBox="0 0 24 24" aria-hidden>
              <path d="M4 20 L20 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </span>
          aviya
        </span>
      )}
    </Link>
  )
}

export function AngleMark({ className }: { className?: string }) {
  return (
    <svg className={cn('text-accent', className)} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M6 26 L26 6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
