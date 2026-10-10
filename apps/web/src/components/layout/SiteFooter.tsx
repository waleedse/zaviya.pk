import Link from 'next/link'
import { CATEGORIES, SITE, type Locale } from '@zaviya/shared'
import { Logo } from '@/components/brand/Logo'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { localePath, t } from '@/lib/i18n'

const POLICY_SLUGS = [
  'about',
  'editorial-policy',
  'ai-policy',
  'corrections',
  'privacy',
  'terms',
  'contact',
  'advertise',
] as const

export function SiteFooter({ locale }: { locale: Locale }) {
  const d = t(locale)
  const tagline = locale === 'ur' ? SITE.taglineUr : SITE.tagline

  return (
    <footer className="mt-16 border-t border-border bg-surface-2/50 pb-24 md:pb-12">
      <div className="container-page grid gap-10 py-12 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo locale={locale} />
          <p className="mt-3 max-w-sm text-fg-muted">{tagline}</p>
          <p className="mt-4 text-sm text-fg-muted">{d.aiNote}</p>
        </div>
        <div className="md:col-span-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">{d.nav.home}</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {CATEGORIES.filter((c) => c.slug !== 'trending').map((c) => (
              <li key={c.slug}>
                <Link href={localePath(locale, `/${c.slug}`)} className="hover:text-accent">
                  {locale === 'ur' ? c.ur : c.en}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">{d.editorial}</h2>
          <ul className="space-y-2 text-sm">
            {POLICY_SLUGS.map((slug) => (
              <li key={slug}>
                <Link href={localePath(locale, `/p/${slug}`)} className="hover:text-accent capitalize">
                  {slug.replace(/-/g, ' ')}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="container-page border-t border-border py-6">
        <WhatsAppCTA locale={locale} compact />
        <p className="mt-6 text-center text-xs text-fg-muted">© {new Date().getFullYear()} {SITE.name}</p>
      </div>
    </footer>
  )
}
