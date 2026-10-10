import type { Locale, SourceRef } from '@zaviya/shared'
import { t } from '@/lib/i18n'

const tierColor: Record<number, string> = { 1: 'bg-up', 2: 'bg-gold', 3: 'bg-fg-muted' }

export function SourcesList({ sources, locale }: { sources: SourceRef[]; locale: Locale }) {
  if (!sources.length) return null
  const d = t(locale)
  return (
    <section className="my-10">
      <h2 className="mb-4 font-display text-h2 font-semibold">{d.sources}</h2>
      <ul className="space-y-3">
        {sources.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tierColor[s.tier] ?? tierColor[3]}`} title={`Tier ${s.tier}`} />
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
              {s.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
