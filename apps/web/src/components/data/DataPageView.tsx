import type { DataPageFull, Locale } from '@zaviya/shared'
import { RateTable } from '@/components/data/RateTable'
import { RateChart } from '@/components/data/RateChart'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { ArticleCard } from '@/components/article/ArticleCard'
import { PageHero } from '@/components/layout/PageHero'
import { GoldCalculator } from '@/components/data/GoldCalculator'
import { TOOLS } from '@/components/home/tools'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Coins, DollarSign, Fuel } from 'lucide-react'
import { SectionHeader } from '@/components/home/SectionHeader'
import { JsonLd } from '@/components/seo/JsonLd'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { formatChange, formatNumber, formatPktTime, todayPktDate } from '@/lib/format'
import { localePath, t } from '@/lib/i18n'

export default function DataPageView({ locale, page, slug }: { locale: Locale; page: DataPageFull; slug: string }) {
  const d = t(locale)
  const isUr = locale === 'ur'
  const h = page.headline
  const ch = h ? formatChange(h.change, h.changePct, locale) : null
  const history = page.history[0]?.points ?? []

  const meta = page.key === 'gold' ? { icon: Coins, color: '#b45309' } : page.key === 'usd-pkr' ? { icon: DollarSign, color: '#1d4ed8' } : { icon: Fuel, color: '#dc2626' }
  const others = TOOLS.filter((tool) => tool.path !== `/${slug}`).slice(0, 6)

  return (
    <div className="pb-8">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: d.nav.home, url: localePath(locale, '/') },
            { name: page.title, url: isUr ? `/ur/${slug}` : `/${slug}` },
          ]),
          ...(page.faqs.length ? [faqJsonLd(page.faqs)] : []),
        ]}
      />
      <PageHero
        title={page.title}
        description={page.intro}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: d.nav.rates }, { label: page.title }]}
        icon={meta.icon}
        color={meta.color}
        eyebrow={todayPktDate(locale)}
      />
      <div className="container-wide grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {h ? (
            <div className="overflow-hidden rounded-[22px] bg-ink text-ink-muted">
              <div className="flex flex-wrap items-end justify-between gap-6 p-6 md:p-8">
                <div>
                  <p className="text-sm font-semibold">{h.label}</p>
                  <p dir="ltr" className="mt-1 font-display text-[clamp(2.6rem,6vw,4.2rem)] font-extrabold leading-none text-white tabular-nums">
                    {formatNumber(h.value)}
                    <span className="ms-2 font-sans text-base font-medium text-ink-muted">{h.unit}</span>
                  </p>
                  {ch && (
                    <p
                      dir="ltr"
                      className={cn(
                        'mt-4 inline-flex rounded-full px-3 py-1.5 text-sm font-extrabold tabular-nums',
                        h.change === 0 ? 'bg-ink-line text-slate-300' : ch.up ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300',
                      )}
                    >
                      {h.change === 0 ? (isUr ? 'کوئی تبدیلی نہیں' : 'No change') : ch.text}
                    </p>
                  )}
                </div>
                <p className="text-sm">
                  {d.lastUpdated}
                  <br />
                  <span className="font-bold text-white">{formatPktTime(page.updatedAt, locale)} PKT</span>
                </p>
              </div>
              {history.length > 1 && (
                <div className="border-t border-ink-line bg-surface p-4 text-fg md:p-6">
                  <RateChart locale={locale} points={history} />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[22px] border border-dashed border-border bg-surface p-10 text-center text-fg-muted">
              {isUr ? 'تازہ ترین ریٹ جلد یہاں دستیاب ہوں گے۔' : 'Today’s rates will appear here as soon as the source publishes them.'}
            </div>
          )}

          {page.key === 'gold' && h && h.series === 'gold_24k_tola' && <GoldCalculator locale={locale} rate24kTola={h.value} />}

          {page.table.length > 0 && (
            <section className="mt-8 card-surface p-5 md:p-6">
              <SectionHeader title={isUr ? 'تفصیلی ریٹ' : 'Full rate table'} />
              <RateTable locale={locale} rows={page.table} />
            </section>
          )}

          {page.key === 'usd-pkr' && (
            <p className="mt-4 text-sm">
              <Link href={localePath(locale, '/riyal-dirham-rate-pakistan')} className="font-semibold underline">
                {isUr ? 'سعودی ریال اور درہم کا آج کا ریٹ' : 'Saudi riyal and UAE dirham rate today'}
              </Link>
            </p>
          )}

          {(page.key === 'gold' || page.key === 'petrol') && (
            <p className="mt-4 text-sm">
              <Link href={localePath(locale, '/chicken-price-pakistan')} className="font-semibold underline">
                {isUr ? 'مرغی کا ریٹ: ہفتہ وار پی بی ایس اوسط' : 'Chicken price in Pakistan: weekly PBS average'}
              </Link>
            </p>
          )}

          {page.key === 'petrol' && (
            <p className="mt-4 text-sm">
              <Link href={localePath(locale, '/fuel-relief-9771-pakistan')} className="font-semibold underline">
                {isUr ? 'Rs100 فی لیٹر پیٹرول ریلیف: 9771 پر رجسٹریشن' : 'Rs100 per litre petrol relief: register on 9771'}
              </Link>
            </p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
            <strong className="text-fg-muted">{d.source}:</strong> {page.source}
          </p>

          <FAQAccordion faqs={page.faqs} locale={locale} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-40 lg:self-start">
          <div className="card-surface p-5">
            <p className="eyebrow mb-3 text-fg-subtle">{isUr ? 'مزید ٹولز' : 'More daily tools'}</p>
            <div className="grid grid-cols-2 gap-2">
              {others.map((tool) => (
                <Link key={tool.path} href={localePath(locale, tool.path)} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 text-[13px] font-bold hover:text-accent">
                  <span className={cn('icon-tile h-8 w-8', tool.tile)}>
                    <tool.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {isUr ? tool.ur : tool.en}
                </Link>
              ))}
            </div>
          </div>
          {page.related.length > 0 && (
            <div className="space-y-3">
              <SectionHeader title={d.related} />
              {page.related.map((a) => (
                <ArticleCard key={a.id} article={a} locale={locale} variant="side" />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
