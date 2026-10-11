'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import type { ArticleCard as Card, CategoryRef, Locale } from '@zaviya/shared'
import { ArticleCard } from '@/components/article/ArticleCard'
import { categoryIcon } from '@/lib/category-icons'
import { localePath } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * "Top stories by section": one tab per category. Every panel is rendered (hidden ones too)
 * so all of the links stay in the HTML for crawlers.
 */
export function SectionTabs({ locale, rails, title }: { locale: Locale; rails: { category: CategoryRef; articles: Card[] }[]; title: string }) {
  const [active, setActive] = useState(rails[0]?.category.slug)
  if (!rails.length) return null
  const isUr = locale === 'ur'
  return (
    <section className="container-wide mt-14">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-[1.9rem] font-extrabold leading-tight md:text-[2.1rem]">{title}</h2>
        <div role="tablist" aria-label={title} className="no-scrollbar -mx-4 flex max-w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 md:mx-0 md:max-w-full md:px-0">
          {rails.map(({ category }) => {
            const Icon = categoryIcon(category.slug)
            const on = category.slug === active
            return (
              <button
                key={category.slug}
                role="tab"
                type="button"
                id={`tab-${category.slug}`}
                aria-selected={on}
                aria-controls={`panel-${category.slug}`}
                onClick={() => setActive(category.slug)}
                className={cn(
                  'inline-flex h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-bold transition-colors',
                  on ? 'border-transparent text-white' : 'border-border bg-surface text-fg-muted hover:text-fg',
                )}
                style={on ? { background: category.color } : undefined}
              >
                <Icon className="h-4 w-4" style={on ? undefined : { color: category.color }} aria-hidden />
                {category.name}
              </button>
            )
          })}
        </div>
      </div>
      {rails.map(({ category, articles }) => (
        <div
          key={category.slug}
          role="tabpanel"
          id={`panel-${category.slug}`}
          aria-labelledby={`tab-${category.slug}`}
          hidden={category.slug !== active}
          className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
        >
          <div className="grid gap-5">
            {articles[0] && <ArticleCard article={articles[0]} locale={locale} variant="large" />}
          </div>
          <div className="flex flex-col gap-3">
            {articles.slice(1, 6).map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="side" />
            ))}
            <Link
              href={localePath(locale, `/${category.slug}`)}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border font-bold text-fg-muted hover:border-accent hover:text-accent"
            >
              {isUr ? `مزید ${category.name}` : `More from ${category.name}`}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </Link>
          </div>
        </div>
      ))}
    </section>
  )
}
