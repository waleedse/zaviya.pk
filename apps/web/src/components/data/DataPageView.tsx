import type { DataPageFull, Locale } from '@zaviya/shared'
import { RateCard } from '@/components/data/RateCard'
import { RateTable } from '@/components/data/RateTable'
import { CityTabs } from '@/components/data/CityTabs'
import { RateChart } from '@/components/data/RateChart'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { ArticleCard } from '@/components/article/ArticleCard'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { JsonLd } from '@/components/seo/JsonLd'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { formatChange, formatNumber, formatPktTime, todayPktDate } from '@/lib/format'
import { localePath, t } from '@/lib/i18n'

export default function DataPageView({ locale, page, slug }: { locale: Locale; page: DataPageFull; slug: string }) {
  const d = t(locale)
  const ch = formatChange(page.headline.change, page.headline.changePct, locale)
  const history = page.history[0]?.points ?? []

  return (
    <div className="container-page py-8">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: d.nav.home, url: localePath(locale, '/') },
            { name: page.title, url: locale === 'ur' ? `/ur/${slug}` : `/${slug}` },
          ]),
          faqJsonLd(page.faqs),
        ]}
      />
      <Breadcrumbs items={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: page.title }]} />
      <h1 className="font-display text-h1 font-semibold">
        {page.title}, {todayPktDate(locale)}
      </h1>
      {page.intro && <p className="mt-3 max-w-2xl text-lg text-fg-muted">{page.intro}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-8">
          <p dir="ltr" className="font-display text-5xl font-bold tabular-nums text-gold">
            {formatNumber(page.headline.value)}
            <span className="ms-2 text-lg font-normal text-fg-muted">{page.headline.unit}</span>
          </p>
          <p dir="ltr" className={`mt-2 text-lg tabular-nums ${ch.up ? 'text-up' : 'text-down'}`}>
            {ch.text}
          </p>
          <p className="mt-4 text-sm text-fg-muted">
            {d.lastUpdated} {formatPktTime(page.updatedAt, locale)} PKT · {d.source}: {page.source}
          </p>
        </div>
        <RateCard rate={page.headline} locale={locale} />
      </div>

      <section className="my-10">
        <RateTable locale={locale} rows={page.table} />
      </section>

      {page.cities && <CityTabs locale={locale} cities={page.cities} />}

      <RateChart locale={locale} points={history} />

      <section className="my-10 rounded-[var(--radius-card)] border border-border bg-surface-2/30 p-6">
        <h2 className="font-display text-h2 font-semibold">{d.todaySummary}</h2>
        <p className="mt-3 text-fg-muted">
          {locale === 'ur'
            ? `آج ${formatNumber(page.headline.value)} ${page.headline.unit} کے قریب ریٹ رپورٹ کیا گیا ہے۔`
            : `Today's ${page.title.toLowerCase()} is around ${formatNumber(page.headline.value)} ${page.headline.unit}, based on the latest official update.`}
        </p>
      </section>

      <FAQAccordion faqs={page.faqs} locale={locale} />

      {page.related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-display text-h2 font-semibold">{d.related}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {page.related.map((a) => (
              <ArticleCard key={a.id} article={a} locale={locale} variant="medium" />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
