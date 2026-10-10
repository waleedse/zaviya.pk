'use client'

import type { Locale } from '@zaviya/shared'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

export function NewsletterCTA({ locale }: { locale: Locale }) {
  const d = t(locale)
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface-2/50 p-8">
      <h2 className="font-display text-h3 font-semibold">{d.newsletter.title}</h2>
      <p className="mt-2 text-sm text-fg-muted">{d.newsletter.desc}</p>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => e.preventDefault()}>
        <input
          type="email"
          placeholder="you@example.com"
          className="h-11 flex-1 rounded-[var(--radius-input)] border border-border bg-surface px-4 text-base"
          dir="ltr"
        />
        <Button type="submit">{d.newsletter.cta}</Button>
      </form>
    </div>
  )
}
