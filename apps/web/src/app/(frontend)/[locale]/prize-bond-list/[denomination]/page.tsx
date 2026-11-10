import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { PrizeBondChecker } from '@/components/prize-bond/PrizeBondChecker'
import { JsonLd } from '@/components/seo/JsonLd'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'
import { formatRs, upcomingDraws } from '@/lib/prize-bonds'
import { RESULT_DENOMINATIONS, denominationFromSlug, denominationSlug, getDraws, rankLabel, type DrawResult } from '@/lib/prize-bond-results'

export const revalidate = 1800

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://zaviya.pk'
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function generateStaticParams() {
  return RESULT_DENOMINATIONS.map((d) => ({ denomination: denominationSlug(d) }))
}

type Params = Promise<{ locale: string; denomination: string }>

export async function generateMetadata({ params }: { params: Params }) {
  const { locale: l, denomination } = await params
  const locale = parseLocale(l)
  const d = denominationFromSlug(denomination)
  if (!d) return {}
  const latest = (await getDraws(d, 1))[0]
  const when = latest ? monthYear(latest.date) : String(new Date().getFullYear())
  const path = `/prize-bond-list/${denominationSlug(d)}`
  return buildPageMetadata({
    locale,
    title:
      locale === 'ur'
        ? `${d} پرائز بانڈ لسٹ ${when}: مکمل نتیجہ اور نمبر چیک کریں`
        : `Rs ${d} Prize Bond List ${when} & Check Online`,
    description:
      locale === 'ur'
        ? `${d} روپے کے پرائز بانڈ کا تازہ ڈرا: پہلا، دوسرا اور تیسرا انعام۔ اپنے نمبر ڈال کر پچھلے تین سال کے سرکاری نتائج میں فوراً چیک کریں۔`
        : `Rs ${d} prize bond draw result${latest ? ` of ${dateLabel(latest.date)}` : ''}: first, second and third prize numbers from the official National Savings list. Paste your bond numbers to check the last 3 years at once.`,
    enPath: path,
    urPath: `/ur${path}`,
    absoluteTitle: true,
  })
}

function ResultTable({ draw }: { draw: DrawResult }) {
  return (
    <div className="space-y-5">
      {draw.tiers.map((t) => (
        <div key={t.rank}>
          <h3 className="font-display text-lg font-bold">
            {rankLabel(t.rank)}
            {t.amount ? ` · Rs ${t.amount.toLocaleString('en-US')}` : ''}
            {t.numbers.length > 1 ? ` · ${t.numbers.length.toLocaleString('en-US')} winners` : ''}
          </h3>
          {t.rank <= 2 ? (
            <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{t.numbers.join('  ')}</p>
          ) : (
            <div className="mt-2 grid max-h-[420px] grid-cols-4 gap-x-3 gap-y-1 overflow-y-auto rounded-xl border border-border p-3 font-mono text-[0.95rem] sm:grid-cols-6 md:grid-cols-8">
              {t.numbers.map((n, i) => (
                <span key={`${n}-${i}`}>{n}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default async function PrizeBondListPage({ params }: { params: Params }) {
  const { locale: l, denomination } = await params
  const locale = parseLocale(l)
  const isUr = locale === 'ur'
  const d = denominationFromSlug(denomination)
  if (!d) notFound()
  const draws = await getDraws(d)
  const latest = draws[0]
  const next = upcomingDraws().find((x) => x.denomination === d)
  const path = `/prize-bond-list/${denominationSlug(d)}`
  const officialPage = `https://savings.gov.pk/rs-${d}-prize-bond-draw/`

  const faqs = [
    {
      q: `When is the next Rs ${d} prize bond draw?`,
      a: next ? `The next Rs ${d} draw is on ${dateLabel(next.date)} in ${next.city}. This page adds the new list as soon as National Savings publishes it.` : 'Check the prize bond schedule page for the next date.',
    },
    {
      q: `What are the Rs ${d} prize bond prizes?`,
      a: latest ? latest.tiers.map((t) => `${rankLabel(t.rank)}: ${t.amount ? `Rs ${t.amount.toLocaleString('en-US')}` : 'see list'} (${t.numbers.length} ${t.numbers.length === 1 ? 'winner' : 'winners'})`).join('; ') + '.' : 'See the official list.',
    },
    { q: 'How do I check many bonds at once?', a: 'Paste all your numbers, separated by commas or spaces, or a range such as 123400-123499. The checker looks through every draw from about the last three years.' },
    { q: 'How is tax charged on prize bond winnings?', a: 'Prize money is taxed at 15% for tax filers and 30% for non-filers, deducted when you claim it.' },
    { q: 'Where do I claim the prize?', a: 'At State Bank (SBP BSC) offices or authorised National Savings centres, with the original bond and your CNIC. Prizes can be claimed for six years after the draw.' },
  ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: localePath(locale, '/') },
            { name: 'Prize bond schedule', url: localePath(locale, '/prize-bond-schedule') },
            { name: `Rs ${d} prize bond list`, url: localePath(locale, path) },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <section className="border-b border-border bg-surface py-8 md:py-10">
        <div className="container-wide flex max-w-[960px] flex-col gap-4">
          <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
            <Link href={localePath(locale, '/')} className="hover:underline">
              Home
            </Link>{' '}
            ›{' '}
            <Link href={localePath(locale, '/prize-bond-schedule')} className="hover:underline">
              Prize bonds
            </Link>{' '}
            › Rs {d}
          </nav>
          <h1 className="font-display text-[clamp(1.8rem,1.3rem+2vw,2.8rem)] font-extrabold leading-tight">
            Rs {d} Prize Bond List {latest ? monthYear(latest.date) : ''}
            {latest?.drawNo ? ` (Draw ${latest.drawNo})` : ''}
          </h1>
          <p className="text-lg text-fg-muted" lang="ur" dir="rtl">
            {d} روپے پرائز بانڈ کا نتیجہ: اپنا نمبر ڈالیں اور فوراً چیک کریں
          </p>
          {next && (
            <p className="rounded-xl bg-accent-soft px-4 py-2 font-semibold">
              Next Rs {d} draw: {dateLabel(next.date)}, {next.city}. Bookmark this page: the new list appears here the same day.
            </p>
          )}
          <PrizeBondChecker denomination={d} pageUrl={`${SITE}${path}`} ur={isUr} />
          <div className="flex flex-wrap gap-2 text-sm">
            {RESULT_DENOMINATIONS.filter((x) => x !== d).map((x) => (
              <Link key={x} href={localePath(locale, `/prize-bond-list/${denominationSlug(x)}`)} className="rounded-full border border-border px-3 py-1 hover:bg-bg">
                {formatRs(x)} list
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[960px] space-y-10">
        {latest ? (
          <section>
            <h2 className="font-display text-2xl font-bold">
              Draw result of {dateLabel(latest.date)}
              {latest.drawNo ? ` (${latest.drawNo}th draw)` : ''}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Source:{' '}
              <a href={latest.sourceUrl} rel="noopener" className="underline">
                official National Savings list
              </a>
              . Always confirm a win on{' '}
              <a href={officialPage} rel="noopener" className="underline">
                savings.gov.pk
              </a>
              .
            </p>
            <div className="mt-4">
              <ResultTable draw={latest} />
            </div>
          </section>
        ) : (
          <p>
            The official list could not be read right now. See{' '}
            <a href={officialPage} rel="noopener" className="underline">
              savings.gov.pk
            </a>
            .
          </p>
        )}

        <WhatsAppCTA locale={locale} />

        {draws.length > 1 && (
          <section>
            <h2 className="font-display text-xl font-bold">Previous Rs {d} draws (checked by the tool above)</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {draws.slice(1).map((x) => (
                <li key={x.date} className="rounded-xl border border-border p-3">
                  <span className="font-semibold">{dateLabel(x.date)}</span>
                  {x.drawNo ? ` · draw ${x.drawNo}` : ''} · first prize <span className="font-mono">{x.tiers[0]?.numbers.join(', ')}</span> ·{' '}
                  <a href={x.sourceUrl} rel="noopener" className="underline">
                    full list
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-fg-muted">Draws that National Savings published only as a PDF are not in the checker; see the official page for those.</p>
          </section>
        )}

        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
