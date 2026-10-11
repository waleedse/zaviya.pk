import Link from 'next/link'
import { SITE, type Locale } from '@zaviya/shared'
import { cn } from '@/lib/utils'
import { localePath } from '@/lib/i18n'

/** Wordmark: the Z mark + "zaviya" (or زاویہ). */
export function Logo({ locale, className, size = 'md', tagline }: { locale: Locale; className?: string; size?: 'md' | 'lg'; tagline?: boolean }) {
  const isUr = locale === 'ur'
  return (
    <Link href={localePath(locale, '/')} className={cn('group inline-flex shrink-0 items-center gap-2.5', className)} aria-label={isUr ? SITE.nameUr : SITE.name}>
      <AngleMark className={size === 'lg' ? 'h-11 w-11' : 'h-9 w-9 md:h-10 md:w-10'} />
      <span className="flex flex-col leading-none">
        {isUr ? (
          <span className={cn('font-display leading-none', size === 'lg' ? 'text-4xl' : 'text-[1.7rem]')}>{SITE.nameUr}</span>
        ) : (
          <span className={cn('font-display font-extrabold lowercase leading-none tracking-[-0.045em]', size === 'lg' ? 'text-[2.1rem]' : 'text-[1.65rem] md:text-[1.8rem]')}>
            zaviya
          </span>
        )}
        {tagline && !isUr ? (
          <span className="mt-1 hidden text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-subtle xl:block">{SITE.tagline}</span>
        ) : null}
      </span>
    </Link>
  )
}

/** The Z: two white bars joined by a gold diagonal, the "angle" Zaviya is named for. */
export function AngleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 44 44" fill="none" aria-hidden>
      <rect width="44" height="44" rx="13" fill="#047857" />
      <path d="M13 13.5h18M13 30.5h18" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M30 14.5 14 29.5" stroke="#FBBF24" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  )
}
