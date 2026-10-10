import { Lightbulb } from 'lucide-react'
import type { Locale } from '@zaviya/shared'
import { RichTextBody } from '@/components/article/RichTextBody'
import { t } from '@/lib/i18n'

export function WhatItMeans({ body, locale }: { body: unknown; locale: Locale }) {
  const d = t(locale)
  return (
    <aside className="my-10 rounded-[var(--radius-card)] border border-accent/20 bg-accent/5 p-6">
      <div className="mb-3 flex items-center gap-2 font-semibold text-accent">
        <Lightbulb className="h-5 w-5" />
        {d.whatItMeans}
      </div>
      <RichTextBody data={body} className="text-fg-muted" />
    </aside>
  )
}
