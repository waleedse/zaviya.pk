import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatPkr } from '@zaviya/shared'
import { PhoneListView, bandLinks, pairLabel } from '@/components/phones/PhoneViews'
import { phoneHref } from '@/components/phones/PhoneParts'
import { getBrands, getPhones } from '@/lib/phones/queries'
import { findPhone, hubFaqs } from '@/lib/phones/pages'
import { popularPairs, recentPriceChanges, sortPhones } from '@/lib/phones/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const phones = await getPhones()
  const year = new Date().getFullYear()
  return buildPageMetadata({
    locale,
    title: `Mobile Prices in Pakistan ${year}: Latest Phone Prices & Specs`,
    description: `Official PKR prices and specs of ${phones.length || 'the latest'} mobile phones sold in Pakistan: Samsung, Infinix, Tecno, Xiaomi, Vivo, Oppo, Realme and Apple. Filter by brand or budget, with price history.`,
    enPath: '/mobile-prices',
    absoluteTitle: true,
    noindex: phones.length === 0,
  })
}

export default async function MobilePricesHub({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  if (locale === 'ur') notFound()
  const [phones, brands] = await Promise.all([getPhones(), getBrands()])
  const popular = sortPhones(phones.filter((p) => p.status !== 'upcoming')).slice(0, 20)
  const changes = recentPriceChanges(phones, new Date(), 14).slice(0, 8)
  const pairs = popularPairs(phones, 60).slice(0, 8)
  const year = new Date().getFullYear()
  const brandsWithPhones = brands.filter((b) => phones.some((p) => p.brand.slug === b.slug))

  return (
    <PhoneListView
      title={`Mobile prices in Pakistan ${year}`}
      description="Official prices in rupees, specs, price history and comparisons for the phones sold in Pakistan. Pick a brand or a budget."
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Prices', href: '/prices' }, { label: 'Mobile prices', url: '/mobile-prices' }]}
      phones={popular}
      brands={brandsWithPhones}
      faqs={hubFaqs(phones.length)}
      emptyText="We are loading the phone catalogue. Please check back shortly."
      extra={
        changes.length > 0 ? (
          <section aria-labelledby="changes">
            <h2 id="changes" className="font-display text-xl font-bold">
              Recent price changes
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {changes.map((c) => (
                <li key={`${c.phone.slug}-${c.date}`} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                  <Link href={phoneHref(c.phone.slug)} className="font-semibold hover:text-accent">
                    {c.phone.brand.name} {c.phone.name}
                  </Link>
                  : {c.from ? `${formatPkr(c.from)} to ` : ''}
                  <span className="font-semibold tabular-nums">{formatPkr(c.to)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
    >
      <section aria-labelledby="bands">
        <h2 id="bands" className="font-display text-xl font-bold">
          Phones by budget
        </h2>
        <div className="mt-3">{bandLinks()}</div>
      </section>
      {pairs.length > 0 && (
        <section aria-labelledby="compare">
          <h2 id="compare" className="font-display text-xl font-bold">
            Popular comparisons
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {pairs.map((p) => {
              const a = findPhone(phones, p.a)
              const b = findPhone(phones, p.b)
              return a && b ? (
                <li key={p.key}>
                  <Link href={`/compare/${p.key}`} className="chip">
                    {pairLabel(a, b)}
                  </Link>
                </li>
              ) : null
            })}
          </ul>
        </section>
      )}
    </PhoneListView>
  )
}
