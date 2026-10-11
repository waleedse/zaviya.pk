import { ExternalLink } from 'lucide-react'
import type { Locale, SourceRef } from '@zaviya/shared'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const TIER: Record<number, { dot: string; en: string; ur: string }> = {
  1: { dot: 'bg-emerald-500', en: 'Primary source', ur: 'بنیادی ماخذ' },
  2: { dot: 'bg-sky-500', en: 'Established outlet', ur: 'معتبر ادارہ' },
  3: { dot: 'bg-slate-400', en: 'Other report', ur: 'دیگر رپورٹ' },
}

export function SourcesList({ sources, locale }: { sources: SourceRef[]; locale: Locale }) {
  if (!sources.length) return null
  const d = t(locale)
  const seen = new Set<string>()
  const unique = sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
  return (
    <section id="sources" className="my-10 scroll-mt-40 rounded-[22px] border border-border bg-surface p-5 md:p-6">
      <h2 className="font-display text-xl font-extrabold">{d.sources}</h2>
      <p className="mt-1 text-sm text-fg-subtle">
        {locale === 'ur'
          ? 'یہ خبر اوپر دیے گئے ذرائع کی بنیاد پر زاویہ نیوز ڈیسک نے تیار کی ہے۔'
          : 'This story was prepared by the Zaviya newsdesk from these sources.'}
      </p>
      <ol className="mt-3 divide-y divide-border">
        {unique.map((s) => {
          const tier = TIER[s.tier] ?? TIER[3]!
          return (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-center justify-between gap-3 py-3">
                <span className="flex min-w-0 items-center gap-2.5 font-semibold">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tier.dot)} aria-hidden />
                  <span className="truncate group-hover:text-accent">{s.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                </span>
                <span className="shrink-0 text-xs text-fg-subtle">{locale === 'ur' ? tier.ur : tier.en}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
