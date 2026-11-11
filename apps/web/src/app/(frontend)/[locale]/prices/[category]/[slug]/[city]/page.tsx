import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plug } from 'lucide-react'
import { formatPkr } from '@zaviya/shared'
import { CityBarChart } from '@/components/appliances/PriceCharts'
import { WhatsAppShare } from '@/components/appliances/PriceParts'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { PageHero } from '@/components/layout/PageHero'
import { JsonLd } from '@/components/seo/JsonLd'
import { applianceHref, PRICES_HUB, categoryHref } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
import { cityHref, cityTitle, cityView } from '@/lib/appliances/cities'
import { monthYear } from '@/lib/appliances/logic'
import { searchName } from '@/lib/appliances/searchNames'
import { parseLocale } from '@/lib/locale'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; category: string; slug: string; city: string }> }

const rs = (n: number | null | undefined) => (n ? formatPkr(Math.round(n)) : '—')
const dateText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' }) : '')

async function load(category: string, slug: string, city: string) {
  const all = await getAppliances()
  const a = all.find((x) => x.slug === slug && x.category.slug === category)
  const v = a ? cityView(a, city) : null
  return a && v ? { a, v } : null
}

export async function generateMetadata({ params }: Params) {
  const { locale: raw, category, slug, city } = await params
  const d = await load(category, slug, city)
  if (!d) return { title: 'Not found', robots: { index: false } }
  const { a, v } = d
  const name = searchName(a)
  return buildPageMetadata({
    locale: parseLocale(raw),
    title: cityTitle(a, v.row.city, monthYear()),
    description: `${name} in ${v.row.city} today: ${rs(v.row.avg)} on average (${a.unit ?? a.name}), lowest ${rs(v.row.min)}, highest ${rs(v.row.max)}. National average ${rs(v.national)}. Official PBS weekly survey.`.slice(0, 300),
    enPath: cityHref(a, v.row.city),
    absoluteTitle: true,
  })
}

export default async function CityRatePage({ params }: Params) {
  const { locale: raw, category, slug, city } = await params
  if (parseLocale(raw) === 'ur') notFound()
  const d = await load(category, slug, city)
  if (!d) notFound()
  const { a, v } = d
  const name = searchName(a)
  const place = v.row.city
  const collected = a.specs.find((s) => /collected on/i.test(s.label))?.value
  const when = collected ? dateText(collected) : dateText(a.priceUpdatedAt)
  const unit = a.unit ? ` (${a.unit})` : ''
  const vs = v.vsNationalPct === 0 ? 'the same as the national average' : `${Math.abs(v.vsNationalPct)}% ${v.vsNationalPct < 0 ? 'below' : 'above'} the national average`
  const faqs = [
    { q: `What is the ${name.toLowerCase()} in ${place} today?`, a: `${rs(v.row.avg)} on average${unit}, from ${rs(v.row.min)} to ${rs(v.row.max)} in different markets${when ? `, in the PBS survey of ${when}` : ''}.` },
    { q: `Is ${a.name.toLowerCase()} cheaper in ${place} than the rest of Pakistan?`, a: `The ${place} average is ${vs} (${rs(v.national)}). The cheapest city is ${v.cheapest.city} at ${rs(v.cheapest.avg)}; the costliest is ${v.costliest.city} at ${rs(v.costliest.avg)}.` },
    { q: 'Where does this price come from?', a: "The Pakistan Bureau of Statistics' Weekly Sensitive Price Indicator, collected in 50 markets of 17 cities. We update this page when PBS publishes, usually on Fridays." },
  ]
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Prices', href: PRICES_HUB },
    { label: a.category.name, href: categoryHref(a.category.slug) },
    { label: a.name, href: applianceHref(a) },
    { label: place },
  ]
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'Prices', url: PRICES_HUB },
            { name: a.category.name, url: categoryHref(a.category.slug) },
            { name: a.name, url: applianceHref(a) },
            { name: place, url: cityHref(a, place) },
          ]),
          faqJsonLd(faqs),
        ]}
      />
      <PageHero
        title={`${name} today in ${place}`}
        description={`${a.name} costs ${rs(v.row.avg)} on average in ${place}${unit}, ${vs}. Lowest ${rs(v.row.min)}, highest ${rs(v.row.max)}.`}
        icon={Plug}
        color="#0f766e"
        eyebrow={`${a.category.name} · ${place}`}
        crumbs={crumbs}
        stats={[
          { label: `Lowest in ${place}`, value: rs(v.row.min) },
          { label: `Average in ${place}`, value: rs(v.row.avg) },
          { label: `Highest in ${place}`, value: rs(v.row.max) },
          { label: 'National average', value: rs(v.national) },
        ]}
      />
      <div className="container-wide mt-8 max-w-[960px] space-y-8">
        <section className="card-surface space-y-2 p-5 text-sm">
          <p>
            <span className="font-semibold">Cheapest city this week:</span> {v.isCheapest ? `${place} itself` : v.cheapest.city} at {rs(v.cheapest.avg)}.{' '}
            <span className="font-semibold">Costliest:</span> {v.isCostliest ? `${place} itself` : v.costliest.city} at {rs(v.costliest.avg)}.
          </p>
          <p className="text-fg-muted">
            {when ? `Prices collected on ${when}. ` : ''}Source:{' '}
            <a href={a.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
              Pakistan Bureau of Statistics weekly price survey
            </a>
            . Full table for all cities on the{' '}
            <Link href={applianceHref(a)} className="underline">
              {a.name} page
            </Link>
            .
          </p>
        </section>
        <section aria-labelledby="city-chart" className="card-surface p-4 md:p-5">
          <h2 id="city-chart" className="font-display text-xl font-bold">
            {name}: {place} against other cities
          </h2>
          <p className="mb-3 mt-1 text-sm text-fg-muted">Average market price this week, cheapest city first. {place} is highlighted.</p>
          <CityBarChart rows={a.cityPrices} highlight={place} />
          <div className="mt-4 flex flex-wrap gap-2">
            <WhatsAppShare a={{ name: `${name} in ${place}`, pricePkr: v.row.avg, unit: a.unit, brand: a.brand }} path={cityHref(a, place)} />
            <Link href={applianceHref(a)} className="inline-flex h-11 items-center rounded-xl border border-border px-4 font-semibold hover:border-accent hover:text-accent">
              Price history
            </Link>
          </div>
        </section>
        <section aria-labelledby="other-cities">
          <h2 id="other-cities" className="font-display text-xl font-bold">
            {name} in other cities
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {v.others.map((c) => (
              <li key={c.city}>
                <Link href={cityHref(a, c.city)} className="chip">
                  {c.city} {rs(c.avg)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}
