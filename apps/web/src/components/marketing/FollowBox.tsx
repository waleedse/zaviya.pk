import type { Locale } from '@zaviya/shared'
import { socialProfileUrls } from '@/lib/seo'
import { NewsletterCTA } from './NewsletterCTA'

const LABELS: [RegExp, string][] = [
  [/facebook\.com/, 'Facebook'],
  [/instagram\.com/, 'Instagram'],
  [/(^|\.)x\.com|twitter\.com/, 'X'],
  [/whatsapp\.com/, 'WhatsApp'],
  [/youtube\.com/, 'YouTube'],
  [/linkedin\.com/, 'LinkedIn'],
]

export function profileLabel(url: string): string | null {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  return LABELS.find(([re]) => re.test(host))?.[1] ?? null
}

/** End-of-page box that turns a one-time reader (often from a shared or boosted link) into a follower or subscriber. */
export function FollowBox({ locale, source }: { locale: Locale; source: string }) {
  const isUr = locale === 'ur'
  const profiles = socialProfileUrls()
    .map((url) => ({ url, label: profileLabel(url) }))
    .filter((p): p is { url: string; label: string } => p.label !== null)

  return (
    <section className="my-8 space-y-4" aria-label={isUr ? 'زاویہ کو فالو کریں' : 'Follow Zaviya News'}>
      {profiles.length ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-border bg-surface p-4">
          <span className="text-sm font-bold">{isUr ? 'روز کی اہم خبریں، فالو کریں' : 'Get Pakistan’s key news daily: follow us'}</span>
          {profiles.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noopener me" className="chip font-bold">
              {p.label}
            </a>
          ))}
        </div>
      ) : null}
      <NewsletterCTA locale={locale} source={source} />
    </section>
  )
}
