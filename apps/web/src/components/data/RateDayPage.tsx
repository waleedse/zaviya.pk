import Link from 'next/link'
import { Coins, DollarSign, Fuel } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import {
  dayChange,
  dayTitle,
  formatRs,
  neighbourDays,
  rateDateLabel,
  rateDayPath,
  rateHistoryPath,
  type RateFamily,
  type SeriesDay,
} from '@/lib/rate-history'
import type { RateDayRow } from '@/lib/rate-history-data'

const META = { gold: { icon: Coins, color: '#b45309' }, 'usd-pkr': { icon: DollarSign, color: '#1d4ed8' }, petrol: { icon: Fuel, color: '#dc2626' } } as const

export function RateDayPage({
  family,
  date,
  rows,
  days,
  previousRows,
}: {
  family: RateFamily
  date: string
  rows: SeriesDay[]
  days: RateDayRow[]
  /** Figures of the previous day we hold data for */
  previousRows: SeriesDay[]
}) {
  const label = rateDateLabel(date)
  const title = dayTitle(family, date, rows)
  const nb = neighbourDays(days.map((d) => d.date), date)
  const meta = META[family.key]
  const head = rows.find((r) => r.series === family.headline) ?? rows[0]!
  const faqs = [
    {
      q: `What was the ${family.noun.toLowerCase()} in Pakistan on ${label}?`,
      a: `On ${label} (Pakistan time) Zaviya recorded ${rows.map((r) => `${r.label} at ${formatRs(r.close)} ${r.suffix}`).join(', ')}.`,
    },
    {
      q: `Where do these ${family.noun.toLowerCase()} figures come from?`,
      a: `${family.basisNote} The latest figure is always on the main page.`,
    },
  ]
  const mainPath = `/${family.slug}`
  return (
    <div className="pb-8">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: `${family.noun} today`, url: mainPath },
            { name: label, url: rateDayPath(family, date) },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <PageHero
        title={title}
        description={`The figures Zaviya News recorded for ${label}, with the previous and next day.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: `${family.noun} today`, href: mainPath }, { label }]}
        icon={meta.icon}
        color={meta.color}
        eyebrow={label}
      />
      <div className="container-wide max-w-[860px] space-y-8 pt-8">
        <section>
          <h2 className="font-display text-xl font-bold">{`${family.noun} on ${label}`}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th className="py-2 pr-4">Figure</th>
                  <th className="py-2 pr-4">At end of day</th>
                  <th className="py-2 pr-4">Change on previous day</th>
                  <th className="py-2">Day range</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ch = dayChange(r.close, previousRows.find((p) => p.series === r.series)?.close)
                  return (
                    <tr key={r.series} className="border-b border-border">
                      <td className="py-2 pr-4 font-semibold">{r.label}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {formatRs(r.close)} <span className="text-fg-muted">{r.suffix}</span>
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{ch ? `${ch.change > 0 ? '+' : ''}${ch.change} (${ch.pct > 0 ? '+' : ''}${ch.pct}%)` : 'No earlier day on record'}</td>
                      <td className="py-2 tabular-nums">{r.low === r.high ? 'No change' : `${formatRs(r.low)} to ${formatRs(r.high)}`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            <strong>Source:</strong> {head.source}. {family.basisNote}
          </p>
        </section>
        <p className="rounded-2xl bg-surface-2 p-4">
          <Link href={mainPath} className="font-bold underline">
            See today&apos;s {family.noun.toLowerCase()} in Pakistan
          </Link>{' '}
          for the latest figure and chart.
        </p>
        <nav aria-label="Other days" className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold">
          {nb.prev ? <Link href={rateDayPath(family, nb.prev)}>&larr; {rateDateLabel(nb.prev)}</Link> : <span />}
          <Link href={rateHistoryPath(family)} className="underline">
            All days
          </Link>
          {nb.next ? <Link href={rateDayPath(family, nb.next)}>{rateDateLabel(nb.next)} &rarr;</Link> : <span />}
        </nav>
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

export function RateHistoryPage({ family, days }: { family: RateFamily; days: RateDayRow[] }) {
  const meta = META[family.key]
  const title = `${family.noun} history in Pakistan: day by day`
  const byMonth = new Map<string, RateDayRow[]>()
  for (const d of days) byMonth.set(d.date.slice(0, 7), [...(byMonth.get(d.date.slice(0, 7)) ?? []), d])
  return (
    <div className="pb-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', url: '/' },
          { name: `${family.noun} today`, url: `/${family.slug}` },
          { name: 'History', url: rateHistoryPath(family) },
        ])}
      />
      <PageHero
        title={title}
        description={`Every day Zaviya News has recorded the ${family.noun.toLowerCase()} in Pakistan, newest first.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: `${family.noun} today`, href: `/${family.slug}` }, { label: 'History' }]}
        icon={meta.icon}
        color={meta.color}
      />
      <div className="container-wide max-w-[860px] space-y-6 pt-8">
        {days.length === 0 ? <p className="text-fg-muted">No days recorded yet.</p> : null}
        {[...byMonth.entries()].map(([month, list]) => (
          <section key={month}>
            <h2 className="font-display text-lg font-bold">{new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00Z`))}</h2>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {list.map((d) => (
                <li key={d.date}>
                  <Link href={rateDayPath(family, d.date)} className="flex justify-between gap-3 rounded-lg px-3 py-2 hover:bg-surface-2">
                    <span>{rateDateLabel(d.date)}</span>
                    {d.headline !== null ? <b className="tabular-nums">{formatRs(d.headline)}</b> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p>
          <Link href={`/${family.slug}`} className="font-bold underline">
            Today&apos;s {family.noun.toLowerCase()} in Pakistan
          </Link>
        </p>
      </div>
    </div>
  )
}
