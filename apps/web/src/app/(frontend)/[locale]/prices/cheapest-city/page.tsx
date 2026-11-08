import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { WhatsAppCTA } from '@/components/marketing/WhatsAppCTA'
import { getAppliances } from '@/lib/appliances/queries'
import { MONTHLY_BASKET, cityBaskets, itemSpreads } from '@/lib/appliances/basket'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { breadcrumbJsonLd, buildPageMetadata, faqJsonLd } from '@/lib/seo'

export const revalidate = 3600

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://zaviya.pk'
const PATH = '/prices/cheapest-city'
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`
const dayLabel = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' }) : '')

async function data() {
  const all = await getAppliances()
  const pbs = all.filter((a) => a.brand.kind === 'source' && a.cityPrices.length)
  const baskets = cityBaskets(pbs)
  const updated = pbs.map((a) => a.priceUpdatedAt ?? a.updatedAt).filter(Boolean).sort().at(-1)
  return { pbs, baskets, spreads: itemSpreads(pbs), updated, source: pbs[0]?.officialUrl }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const { baskets } = await data()
  const lo = baskets[0]
  const hi = baskets.at(-1)
  return buildPageMetadata({
    locale,
    title: lo && hi ? `Cheapest City in Pakistan This Week: ${lo.city} vs ${hi.city} Grocery Prices (17 Cities)` : 'Cheapest City in Pakistan for Groceries: 17 Cities Compared',
    description:
      lo && hi
        ? `A family's monthly groceries cost ${rs(lo.total)} in ${lo.city} and ${rs(hi.total)} in ${hi.city} this week. Atta, sugar, ghee, milk, eggs, chicken and LPG compared across 17 cities from official PBS prices.`
        : 'Atta, sugar, ghee, milk, eggs, chicken and LPG prices compared across 17 Pakistani cities from the official PBS weekly survey.',
    enPath: PATH,
    absoluteTitle: true,
  })
}

export default async function CheapestCityPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  if (locale === 'ur') notFound()
  const { pbs, baskets, spreads, updated, source } = await data()
  if (!baskets.length) notFound()
  const lo = baskets[0]!
  const hi = baskets.at(-1)!
  const gap = hi.total - lo.total
  const share = encodeURIComponent(
    `Is hafte ${lo.city} sab se sasta: mahana rashan ${rs(lo.total)}, jabke ${hi.city} mein ${rs(hi.total)} (${rs(gap)} zyada). Apne shehar ka daam dekhein: ${SITE}${PATH}?utm_source=whatsapp&utm_medium=share&utm_campaign=basket`,
  )
  const faqs = [
    { q: 'Which is the cheapest city in Pakistan for groceries this week?', a: `${lo.city}: the monthly basket below costs ${rs(lo.total)} there, against ${rs(hi.total)} in ${hi.city}, the costliest city this week.` },
    { q: 'Where do these prices come from?', a: "The Pakistan Bureau of Statistics' Weekly Sensitive Price Indicator (SPI), which surveys 50 markets in 17 cities. We use each city's average price and update the page when PBS publishes, usually on Fridays." },
    { q: 'What is in the basket?', a: `${MONTHLY_BASKET.map((b) => b.label).join(', ')}. It is our simple assumption for a family of five for one month, kept the same every week so cities and weeks can be compared.` },
    ...spreads.slice(0, 3).map((s) => ({ q: `Where is ${s.item.name.toLowerCase()} cheapest?`, a: `${s.cheapest.city} at ${rs(s.cheapest.avg)}; it is ${s.gapPct}% dearer in ${s.costliest.city} (${rs(s.costliest.avg)}).` })),
  ]

  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: localePath(locale, '/') },
            { name: 'Prices', url: localePath(locale, '/prices') },
            { name: 'Cheapest city', url: localePath(locale, PATH) },
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
            <Link href={localePath(locale, '/prices')} className="hover:underline">
              Prices
            </Link>{' '}
            › Cheapest city
          </nav>
          <h1 className="font-display text-[clamp(1.8rem,1.3rem+2vw,2.8rem)] font-extrabold leading-tight">Cheapest city in Pakistan for groceries this week</h1>
          <p className="text-lg" lang="ur" dir="rtl">
            اس ہفتے سب سے سستا شہر {lo.city}، سب سے مہنگا {hi.city}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border-2 border-green-600 bg-bg p-4">
              <p className="text-sm font-semibold uppercase text-fg-muted">Cheapest</p>
              <p className="font-display text-2xl font-extrabold">{lo.city}</p>
              <p className="text-lg">{rs(lo.total)} / month</p>
            </div>
            <div className="rounded-2xl border-2 border-red-600 bg-bg p-4">
              <p className="text-sm font-semibold uppercase text-fg-muted">Costliest</p>
              <p className="font-display text-2xl font-extrabold">{hi.city}</p>
              <p className="text-lg">{rs(hi.total)} / month</p>
            </div>
            <div className="rounded-2xl border border-border bg-bg p-4">
              <p className="text-sm font-semibold uppercase text-fg-muted">Difference</p>
              <p className="font-display text-2xl font-extrabold">{rs(gap)}</p>
              <p className="text-lg">a month, same groceries</p>
            </div>
          </div>
          <p className="text-sm text-fg-muted">
            Official PBS weekly prices (city averages){updated ? `, updated ${dayLabel(updated)}` : ''}.{' '}
            {source && (
              <a href={source} rel="noopener" className="underline">
                PBS release
              </a>
            )}
          </p>
          <a href={`https://wa.me/?text=${share}`} target="_blank" rel="noopener" className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 font-semibold text-white">
            Share on WhatsApp
          </a>
        </div>
      </section>

      <div className="container-wide mt-8 max-w-[960px] space-y-10">
        <section>
          <h2 className="font-display text-2xl font-bold">All 17 cities ranked: monthly kitchen basket</h2>
          <p className="mt-1 text-sm text-fg-muted">Basket: {MONTHLY_BASKET.map((b) => b.label).join(', ')}.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">City</th>
                  <th className="py-2 pr-3">Basket / month</th>
                  <th className="py-2 pr-3">vs cheapest</th>
                  <th className="py-2">Atta 20 kg</th>
                </tr>
              </thead>
              <tbody>
                {baskets.map((b, i) => (
                  <tr key={b.city} className="border-b border-border">
                    <td className="py-2 pr-3">{i + 1}</td>
                    <td className="py-2 pr-3 font-semibold">{b.city}</td>
                    <td className="py-2 pr-3">{rs(b.total)}</td>
                    <td className="py-2 pr-3">{i === 0 ? '—' : `+${rs(b.total - lo.total)}`}</td>
                    <td className="py-2">{b.lines['atta-20kg-price'] ? rs(b.lines['atta-20kg-price'] / 2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">Where each item is cheapest</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[0.95rem]">
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Cheapest</th>
                  <th className="py-2 pr-3">Costliest</th>
                  <th className="py-2">Gap</th>
                </tr>
              </thead>
              <tbody>
                {spreads.map((s) => (
                  <tr key={s.item.slug} className="border-b border-border">
                    <td className="py-2 pr-3">
                      <Link href={localePath(locale, `/prices/${s.item.category.slug}/${s.item.slug}`)} className="font-semibold hover:underline">
                        {s.item.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {s.cheapest.city} {rs(s.cheapest.avg)}
                    </td>
                    <td className="py-2 pr-3">
                      {s.costliest.city} {rs(s.costliest.avg)}
                    </td>
                    <td className="py-2">{s.gapPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-fg-muted">Each item page has the lowest, average and highest price in every city.</p>
        </section>

        <WhatsAppCTA locale={locale} />
        <FAQAccordion faqs={faqs} locale={locale} />
      </div>
    </div>
  )
}
