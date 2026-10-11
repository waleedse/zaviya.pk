import { ChevronRight, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Page header band used by section, tag, author, live, search and info pages:
 * breadcrumb, icon tile, title, description and optional stat chips, tinted with the page colour.
 */
export function PageHero({
  title,
  description,
  crumbs,
  icon: Icon,
  color = '#047857',
  eyebrow,
  stats,
  children,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  crumbs?: { label: string; href?: string }[]
  icon?: LucideIcon
  color?: string
  eyebrow?: React.ReactNode
  stats?: { label: string; value: React.ReactNode }[]
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('border-b border-border py-8 md:py-10', className)}
      style={{ background: `color-mix(in oklab, ${color} 7%, var(--bg))` }}
    >
      <div className="container-wide">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-5 text-sm text-fg-muted">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />}
                  {c.href ? (
                    <Link href={c.href} className="hover:text-accent">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-fg">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 items-start gap-4 md:gap-5">
            {Icon && (
              <span className="icon-tile h-14 w-14 shrink-0 rounded-2xl text-white md:h-16 md:w-16" style={{ background: color }}>
                <Icon className="h-7 w-7 md:h-8 md:w-8" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <p className="eyebrow mb-1.5" style={{ color }}>
                  {eyebrow}
                </p>
              )}
              <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3rem)] font-extrabold leading-[1.05]">{title}</h1>
              {description && <p className="mt-2.5 max-w-[68ch] text-[1.05rem] text-fg-muted">{description}</p>}
            </div>
          </div>
          {stats && stats.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-border bg-surface px-4 py-2.5">
                  <p className="font-display text-xl font-extrabold leading-tight tabular-nums">{s.value}</p>
                  <p className="text-xs font-semibold text-fg-subtle">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        {children}
      </div>
    </section>
  )
}
