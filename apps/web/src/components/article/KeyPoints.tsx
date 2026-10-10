import type { Locale } from '@zaviya/shared'
import { t } from '@/lib/i18n'

export function KeyPoints({ points, locale }: { points: string[]; locale: Locale }) {
  if (!points.length) return null
  const d = t(locale)
  return (
    <aside className="my-8 rounded-[var(--radius-card)] border border-border bg-accent/5 p-6 ps-5 [border-inline-start:4px_solid_var(--accent)]">
      <h2 className="mb-4 font-semibold">{d.keyPoints}</h2>
      <ul className="list-disc space-y-2 ps-5 marker:text-accent">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </aside>
  )
}
