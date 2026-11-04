import Link from 'next/link'
import { CalendarDays, SnowflakeIcon } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { dateLabel } from '@/lib/result-boards'
import {
  activeClosures,
  closureRange,
  closuresPath,
  closureTomorrow,
  REASON_LABEL,
  SEASON,
  vacationRegionPath,
  vacationsHubPath,
  vacationText,
  VACATION_REGIONS,
  type ClosureView,
  type VacationRegionDef,
  type VacationView,
} from '@/lib/vacations'

const COLOR = '#0369a1'

const latestDay = (...days: (string | undefined)[]): string | undefined => days.filter((d): d is string => Boolean(d)).sort().pop()

function SourceLine({ v }: { v: Pick<VacationView, 'sourceUrl' | 'sourceNote' | 'sourceDate'> }) {
  if (!v.sourceUrl && !v.sourceNote) return null
  return (
    <p className="mt-1 text-sm">
      Source:{' '}
      {v.sourceUrl ? (
        <a href={v.sourceUrl} rel="noopener nofollow" className="underline">
          {v.sourceNote ?? v.sourceUrl}
        </a>
      ) : (
        v.sourceNote
      )}
      {v.sourceDate ? ` (${dateLabel(v.sourceDate)})` : ''}
    </p>
  )
}

function ClosureList({ items, empty }: { items: (ClosureView & { state: string })[]; empty: string }) {
  if (!items.length) return <p className="text-fg-muted">{empty}</p>
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={`${c.region}-${c.date}-${c.scope}`} className="rounded-2xl border border-border p-4">
          <p className="font-bold">
            {c.scope}{' '}
            <span className="ms-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">{c.state === 'tomorrow' ? 'Tomorrow' : c.state === 'today' ? 'Today' : 'Upcoming'}</span>
          </p>
          <p className="text-sm">
            {closureRange(c)} · {REASON_LABEL[c.reason]}
            {c.status === 'extended' ? ' · extended' : ''}
          </p>
          <SourceLine v={c} />
          {c.notes && <p className="mt-1 text-sm">{c.notes}</p>}
        </li>
      ))}
    </ul>
  )
}

export function VacationsHub({ vacations, closures, today }: { vacations: VacationView[]; closures: ClosureView[]; today: string }) {
  const tomorrow = closureTomorrow(closures, today)
  const faqs = [
    { q: `Winter vacations ${SEASON} kab se shuru hongi?`, a: 'Every province notifies its own dates. The table shows a date only when it comes from a notification or a named report, with the source. Where it says "Not announced yet", no date exists to publish.' },
    { q: 'Are schools closed tomorrow because of smog?', a: `Closures are listed on the schools-closed-tomorrow tracker the moment an official notice or a named report appears. See ${absoluteUrl(closuresPath())}.` },
    { q: 'Do the winter vacations apply to private schools and universities?', a: 'Provincial notifications usually name the schools covered. Private schools and universities follow their own notices; check the notification linked on your province page.' },
  ]
  const updated = latestDay(...vacations.map((v) => v.updatedAt?.slice(0, 10)))
  return (
    <div className="pb-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: `Winter vacations ${SEASON}`, url: vacationsHubPath() }]), faqJsonLd(faqs)]} />
      <PageHero
        title={`Winter Vacations ${SEASON} in Pakistan: Punjab, Sindh, KP, Balochistan, Islamabad`}
        description="Winter break dates for every province and Islamabad, with the source of each date, plus smog and weather school closures."
        crumbs={[{ label: 'Home', href: '/' }, { label: `Winter vacations ${SEASON}` }]}
        icon={SnowflakeIcon}
        color={COLOR}
        eyebrow="Winter break tracker"
      />
      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        {tomorrow.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">Schools closed tomorrow</h2>
            <div className="mt-3">
              <ClosureList items={tomorrow} empty="" />
            </div>
          </section>
        )}
        <section>
          <h2 className="font-display text-xl font-bold">Winter break dates by province</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th className="py-2 pr-4">Region</th>
                  <th className="py-2">{`Winter break ${SEASON}`}</th>
                </tr>
              </thead>
              <tbody>
                {VACATION_REGIONS.map((r) => {
                  const v = vacations.find((x) => x.region === r.slug) ?? { region: r.slug, status: 'not_announced' as const }
                  return (
                    <tr key={r.slug} className="border-b border-border align-top">
                      <td className="py-2 pr-4 font-semibold">
                        <Link href={vacationRegionPath(r.slug)} className="hover:text-accent">
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-2">
                        {vacationText(v)}
                        <SourceLine v={v} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {updated && <p className="mt-3 text-sm text-fg-muted">Last updated: {dateLabel(updated)}</p>}
        </section>
        <p className="rounded-2xl bg-surface-2 p-4">
          <Link href={closuresPath()} className="font-bold underline">
            Schools closed tomorrow: smog and weather closures
          </Link>
          {' · '}
          <Link href="/aqi-pakistan" className="font-bold underline">
            Air quality (AQI) in Pakistan today
          </Link>
        </p>
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

export function VacationRegionPage({ region, v, closures, today }: { region: VacationRegionDef; v: VacationView; closures: ClosureView[]; today: string }) {
  const mine = activeClosures(closures.filter((c) => c.region === region.slug), today)
  const path = vacationRegionPath(region.slug)
  const faqs = [
    { q: `${region.romanUrdu} (When are the winter vacations in ${region.name}?)`, a: v.status === 'not_announced' || !v.startDate ? `${region.name} has not announced the ${SEASON} winter vacations yet. We do not guess a date: this page changes when ${region.authority} notifies them or a named report gives the dates.` : `${vacationText(v)}.${v.sourceNote ? ` Source: ${v.sourceNote}.` : ''}` },
    { q: `Are schools closed tomorrow in ${region.name}?`, a: mine.length ? `Yes, a closure is on record: ${mine[0]!.scope}, ${closureRange(mine[0]!)}.` : `No closure notification for ${region.name} is on record for tomorrow. Check the schools-closed-tomorrow tracker for updates.` },
    { q: 'Who announces the winter vacations?', a: `${region.name[0]!.toUpperCase()}${region.name.slice(1)}'s break is notified by ${region.authority}.` },
  ]
  const updated = latestDay(v.updatedAt?.slice(0, 10), ...mine.map((c) => c.updatedAt?.slice(0, 10)))
  return (
    <div className="pb-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: `Winter vacations ${SEASON}`, url: vacationsHubPath() }, { name: region.name, url: path }]), faqJsonLd(faqs)]} />
      <PageHero
        title={`Winter Vacations ${SEASON} in ${region.name}: Dates and School Closures`}
        description={`When the ${region.name} winter break starts and ends, the source of the date, last year's break, and smog closures.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: `Winter vacations ${SEASON}`, href: vacationsHubPath() }, { label: region.name }]}
        icon={CalendarDays}
        color={COLOR}
        eyebrow="Winter break"
      />
      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{`Winter break ${SEASON}`}</p>
          <p className="mt-1 font-display text-2xl font-bold">{vacationText(v)}</p>
          <SourceLine v={v} />
          {updated && <p className="mt-1 text-sm text-fg-muted">Last updated: {dateLabel(updated)}</p>}
        </div>
        {v.notes && <p className="whitespace-pre-line rounded-2xl bg-surface-2 p-4">{v.notes}</p>}
        {v.lastYear && (v.lastYear.note || v.lastYear.startDate) && (
          <section className="rounded-2xl border border-dashed border-border p-4">
            <h2 className="font-display text-lg font-bold">Last year (2025-26), for reference</h2>
            {v.lastYear.startDate && <p className="mt-1">{v.lastYear.endDate ? `${dateLabel(v.lastYear.startDate)} to ${dateLabel(v.lastYear.endDate)}` : `From ${dateLabel(v.lastYear.startDate)}`}</p>}
            {v.lastYear.note && <p className="mt-1 text-sm">{v.lastYear.note}</p>}
            <p className="mt-1 text-sm text-fg-muted">These are last year&apos;s dates, not this year&apos;s.</p>
          </section>
        )}
        <section>
          <h2 className="font-display text-xl font-bold">{`School closures in ${region.name}`}</h2>
          <div className="mt-3">
            <ClosureList items={mine} empty={`No ${region.name} closure notification is on record right now. Smog and weather closures appear here, with their source, as soon as they are announced.`} />
          </div>
          <p className="mt-3 text-sm">
            <Link href="/aqi-pakistan" className="font-bold underline">
              Check today&apos;s air quality (AQI)
            </Link>
            {' · '}
            <Link href={closuresPath()} className="font-bold underline">
              All schools-closed-tomorrow notices
            </Link>
          </p>
        </section>
        <FAQAccordion faqs={faqs} locale="en" />
        <section>
          <h2 className="font-display text-lg font-bold">Other regions</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {VACATION_REGIONS.filter((r) => r.slug !== region.slug).map((r) => (
              <li key={r.slug}>
                <Link href={vacationRegionPath(r.slug)} className="chip">
                  {r.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href={vacationsHubPath()} className="chip font-bold">
                All regions
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}

export function ClosuresPage({ closures, today }: { closures: ClosureView[]; today: string }) {
  const active = activeClosures(closures, today)
  const tomorrow = closureTomorrow(closures, today)
  const faqs = [
    { q: 'Kal school band hain? (Are schools closed tomorrow?)', a: tomorrow.length ? `Yes, a closure for tomorrow is on record: ${tomorrow.map((c) => `${c.scope} (${closureRange(c)})`).join('; ')}.` : 'No closure for tomorrow is on record. We list a closure only when there is an official notification or a named news report, with its source.' },
    { q: 'Why are schools closed for smog?', a: 'Provincial governments close schools when the air quality index stays in the hazardous range. See the live AQI page for the current readings.' },
    { q: 'Where is the official notice?', a: 'Each entry links to the notification or report it comes from. Provincial education departments publish the notices on their own channels.' },
  ]
  const updated = latestDay(...closures.map((c) => c.updatedAt?.slice(0, 10)))
  return (
    <div className="pb-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: 'Schools closed tomorrow', url: closuresPath() }]), faqJsonLd(faqs)]} />
      <PageHero
        title="Schools Closed Tomorrow in Pakistan: Smog and Weather Closures"
        description="School closures announced for smog, rain and other reasons in Punjab, Sindh, KP, Balochistan and Islamabad, with the source of each."
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Schools closed tomorrow' }]}
        icon={CalendarDays}
        color={COLOR}
        eyebrow={`Checked for ${dateLabel(today)}`}
      />
      <div className="container-wide mt-8 max-w-[860px] space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold">Closed tomorrow</h2>
          <div className="mt-3">
            <ClosureList items={tomorrow} empty="No school closure for tomorrow is on record. Closures appear here as soon as an official notice or a named report is available." />
          </div>
        </section>
        {active.filter((c) => !tomorrow.includes(c)).length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">Other current and upcoming closures</h2>
            <div className="mt-3">
              <ClosureList items={active.filter((c) => !tomorrow.includes(c))} empty="" />
            </div>
          </section>
        )}
        {updated && <p className="text-sm text-fg-muted">Last updated: {dateLabel(updated)}</p>}
        <p className="rounded-2xl bg-surface-2 p-4">
          <Link href="/aqi-pakistan" className="font-bold underline">
            Air quality (AQI) in Pakistan today
          </Link>
          {' · '}
          <Link href={vacationsHubPath()} className="font-bold underline">
            {`Winter vacations ${SEASON}`}
          </Link>
        </p>
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}
