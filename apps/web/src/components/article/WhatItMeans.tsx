import { UserRound } from 'lucide-react'
import type { Locale } from '@zaviya/shared'
import { RichTextBody } from '@/components/article/RichTextBody'
import { t } from '@/lib/i18n'

export function WhatItMeans({ body, locale }: { body: unknown; locale: Locale }) {
  const d = t(locale)
  return (
    <aside className="my-10 rounded-[22px] border border-accent-line bg-accent-soft p-6 md:p-7">
      <h2 className="mb-4 flex items-center gap-2.5 font-display text-2xl font-extrabold">
        <span className="icon-tile h-9 w-9 bg-accent text-accent-fg">
          <UserRound className="h-[18px] w-[18px]" aria-hidden />
        </span>
        {d.whatItMeans}
      </h2>
      <RichTextBody data={body} />
    </aside>
  )
}
