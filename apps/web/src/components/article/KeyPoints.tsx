import { Zap } from 'lucide-react'
import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'

export function KeyPoints({ points, locale }: { points: string[]; locale: Locale }) {
  if (!points.length) return null
  const d = t(locale)
  return (
    <aside className="my-8 rounded-[22px] bg-ink p-6 text-slate-200 md:p-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-xl font-extrabold text-white">
          <span className="icon-tile h-8 w-8 rounded-[10px] bg-amber-400 text-[#0b1220]">
            <Zap className="h-4 w-4" aria-hidden />
          </span>
          {d.keyPoints}
        </h2>
        <span className="text-xs text-ink-muted">{locale === 'ur' ? '30 سیکنڈ میں' : '30-second read'}</span>
      </div>
      <ol className="space-y-3">
        {points.map((p, i) => (
          <li key={i} className="flex gap-3.5 leading-relaxed">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-ink-line font-display text-sm font-extrabold text-amber-300" aria-hidden>
              {i + 1}
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}
