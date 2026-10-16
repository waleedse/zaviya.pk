import Link from 'next/link'
import { CATEGORIES, SITE, type Locale } from '@zaviya/shared'
import { Logo } from '@/components/brand/Logo'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { localePath, t } from '@/lib/i18n'
import { TOOLS } from '@/components/home/tools'

const POLICIES: { slug: string; en: string; ur: string }[] = [
  { slug: 'about', en: 'About us', ur: 'ہمارے بارے میں' },
  { slug: 'editorial-policy', en: 'Editorial policy', ur: 'ادارتی پالیسی' },
  { slug: 'corrections', en: 'Corrections', ur: 'تصحیحات' },
  { slug: 'contact', en: 'Contact', ur: 'رابطہ' },
  { slug: 'privacy', en: 'Privacy', ur: 'پرائیویسی' },
  { slug: 'terms', en: 'Terms', ur: 'شرائط' },
]

export function SiteFooter({ locale }: { locale: Locale }) {
  const d = t(locale)
  const isUr = locale === 'ur'
  return (
    <footer className="mt-20 bg-ink pb-24 text-slate-300 md:pb-10 dark:border-t dark:border-border">
      <div className="container-page grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-4">
          <div className="text-white">
            <Logo locale={locale} size="lg" />
          </div>
          <p className="mt-4 max-w-sm font-display text-xl font-bold text-white">{isUr ? SITE.taglineUr : SITE.tagline}</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            {isUr
              ? 'زاویہ پاکستان کی اہم خبریں آسان زبان میں پیش کرتا ہے۔'
              : 'Zaviya explains the news that matters to Pakistan in clear English and Urdu.'}
          </p>
          <div className="mt-6">
            <WhatsAppCTA locale={locale} compact />
          </div>
        </div>
        <div className="md:col-span-3">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{isUr ? 'سیکشنز' : 'Sections'}</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link href={localePath(locale, `/${c.slug}`)} className="hover:text-white">
                  {isUr ? c.ur : c.en}
                </Link>
              </li>
            ))}
            <li>
              <Link href={localePath(locale, '/gold-rate-today-pakistan')} className="hover:text-white">
                {d.gold}
              </Link>
            </li>
            <li>
              <Link href={localePath(locale, '/dollar-rate-today-pakistan')} className="hover:text-white">
                {d.dollar}
              </Link>
            </li>
          </ul>
        </div>
        <div className="md:col-span-3">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{isUr ? 'روزمرہ ٹولز' : 'Daily tools'}</h2>
          <ul className="space-y-2.5">
            {TOOLS.map((tool) => (
              <li key={tool.path}>
                <Link href={localePath(locale, tool.path)} className="inline-flex items-center gap-2 hover:text-white">
                  <tool.icon className="h-4 w-4 text-slate-500" aria-hidden />
                  {isUr ? tool.ur : tool.en}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{isUr ? 'زاویہ' : 'Zaviya'}</h2>
          <ul className="space-y-2.5">
            {POLICIES.map((p) => (
              <li key={p.slug}>
                <Link href={localePath(locale, `/p/${p.slug}`)} className="hover:text-white">
                  {isUr ? p.ur : p.en}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="container-page flex flex-col gap-2 border-t border-white/10 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
        <p>
          © {new Date().getFullYear()} {SITE.name}. {isUr ? 'جملہ حقوق محفوظ ہیں۔' : 'All rights reserved.'}
        </p>
        <p>
          <a href="/rss.xml" className="hover:text-white">
            RSS
          </a>
          <span className="mx-2">·</span>
          <a href="/sitemap.xml" className="hover:text-white">
            Sitemap
          </a>
        </p>
      </div>
    </footer>
  )
}
