import { ArrowRight, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Section title with an optional icon tile and a "See all" link. */
export function SectionHeader({
  title,
  href,
  linkLabel,
  color,
  icon: Icon,
  tile,
  className,
}: {
  title: string
  href?: string
  linkLabel?: string
  color?: string
  icon?: LucideIcon
  tile?: string
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-center justify-between gap-4', className)}>
      <h2 className="flex items-center gap-2.5 font-display text-[1.45rem] font-extrabold leading-tight" style={color ? { color } : undefined}>
        {Icon ? (
          <span className={cn('icon-tile h-9 w-9', tile ?? 'bg-accent-soft text-accent')}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />
          </span>
        ) : null}
        {title}
      </h2>
      {href && linkLabel && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-accent hover:underline">
          {linkLabel}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </div>
  )
}
