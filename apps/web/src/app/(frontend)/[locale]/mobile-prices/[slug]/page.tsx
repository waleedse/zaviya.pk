import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PhoneListView, bandLinks } from '@/components/phones/PhoneViews'
import { getBrandBySlug, getBrands, getPhones } from '@/lib/phones/queries'
import { bandFaqs, brandFaqs } from '@/lib/phones/pages'
import { MIN_INDEXABLE_LIST, bandLabel, latestPhones, parseBandSlug, phoneIndexable, phonesUnder, sortPhones, upcomingPhones } from '@/lib/phones/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Params) {
  const { locale: raw, slug } = await params
  const locale = parseLocale(raw)
  const year = new Date().getFullYear()
  if (slug === 'upcoming') {
    const phones = upcomingPhones(await getPhones())
    return buildPageMetadata({
      locale,
      title: `Upcoming Mobile Phones in Pakistan ${year}: Expected Launch Dates`,
      description: `Phones expected to launch in Pakistan soon: ${phones.slice(0, 4).map((p) => `${p.brand.name} ${p.name}`).join(', ') || 'Samsung, Infinix, Tecno, Xiaomi, Vivo, Oppo and Realme'}. Launch dates and prices as soon as they are official.`,
      enPath: '/mobile-prices/upcoming',
      absoluteTitle: true,
      noindex: phones.length < MIN_INDEXABLE_LIST,
    })
  }
  if (slug === 'new-phones') {
    const phones = latestPhones(await getPhones(), new Date())
    return buildPageMetadata({
      locale,
      title: `New Mobile Phones in Pakistan ${year}: Latest Launches & Prices`,
      description: `The latest phones on sale in Pakistan with official PKR prices: ${phones.slice(0, 4).map((p) => `${p.brand.name} ${p.name}`).join(', ')}, and more.`,
      enPath: '/mobile-prices/new-phones',
      absoluteTitle: true,
      noindex: phones.filter(phoneIndexable).length < MIN_INDEXABLE_LIST,
    })
  }
  const band = parseBandSlug(slug)
  if (band) {
    const phones = phonesUnder(await getPhones(), band)
    return buildPageMetadata({
      locale,
      title: `Best Phones Under Rs ${bandLabel(band)} in Pakistan (${year} Prices)`,
      description: `${phones.length || 'The'} phones with an official price under Rs ${bandLabel(band)} in Pakistan: price in PKR, specs and price history, checked daily from the brands' Pakistan sites.`,
      enPath: `/mobile-prices/${slug}`,
      absoluteTitle: true,
      noindex: phones.length < MIN_INDEXABLE_LIST,
    })
  }
  const brand = await getBrandBySlug(slug)
  if (!brand) return { title: 'Not found', robots: { index: false } }
  const phones = (await getPhones()).filter((p) => p.brand.slug === slug)
  return buildPageMetadata({
    locale,
    title: `${brand.name} Mobile Prices in Pakistan ${year}: All Models`,
    description: `${brand.name} phone prices in Pakistan in PKR with specs: ${phones.length} models, official prices checked daily, price history and comparisons.`,
    enPath: `/mobile-prices/${slug}`,
    absoluteTitle: true,
    noindex: phones.length === 0,
  })
}

export default async function MobilePricesList({ params }: Params) {
  const { locale: raw, slug } = await params
  const locale = parseLocale(raw)
  if (locale === 'ur') notFound()
  const [all, brands] = await Promise.all([getPhones(), getBrands()])
  const brandsWithPhones = brands.filter((b) => all.some((p) => p.brand.slug === b.slug))
  const year = new Date().getFullYear()

  if (slug === 'upcoming' || slug === 'new-phones') {
    const upcoming = slug === 'upcoming'
    const phones = upcoming ? upcomingPhones(all) : latestPhones(all, new Date())
    const label = upcoming ? 'Upcoming phones' : 'New phones'
    return (
      <PhoneListView
        title={upcoming ? `Upcoming mobile phones in Pakistan ${year}` : `New mobile phones in Pakistan ${year}`}
        description={
          upcoming
            ? 'Phones the brands have announced or teased for Pakistan. We add the official price and launch date the day they are published.'
            : "The newest phones on sale in Pakistan, with official PKR prices from the brands' own sites."
        }
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Prices', href: '/prices' }, { label: 'Mobile prices', href: '/mobile-prices' }, { label, url: `/mobile-prices/${slug}` }]}
        phones={phones}
        brands={brandsWithPhones}
        emptyText={upcoming ? 'No upcoming phone has been officially announced for Pakistan yet. Check the new phones list.' : 'No phones listed yet.'}
      >
        <p className="text-sm text-fg-muted">
          {upcoming ? (
            <>
              Already launched? See <Link href="/mobile-prices/new-phones" className="underline">new phones in Pakistan</Link>.
            </>
          ) : (
            <>
              Coming soon: <Link href="/mobile-prices/upcoming" className="underline">upcoming phones in Pakistan</Link>.
            </>
          )}
        </p>
      </PhoneListView>
    )
  }
  const band = parseBandSlug(slug)
  if (band) {
    const phones = phonesUnder(all, band)
    return (
      <PhoneListView
        title={`Best phones under Rs ${bandLabel(band)} in Pakistan`}
        description={`Phones with an official price of Rs ${bandLabel(band)} or less in Pakistan, ${year} prices in PKR, sorted by popularity.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Prices', href: '/prices' }, { label: 'Mobile prices', href: '/mobile-prices' }, { label: `Under Rs ${bandLabel(band)}`, url: `/mobile-prices/${slug}` }]}
        phones={phones}
        brands={brandsWithPhones}
        active={{ band }}
        faqs={bandFaqs(band, phones)}
        emptyText={`No phone has an official Pakistan price under Rs ${bandLabel(band)} in our list yet. Try a higher budget.`}
      >
        <section aria-labelledby="bands">
          <h2 id="bands" className="font-display text-xl font-bold">
            Other budgets
          </h2>
          <div className="mt-3">{bandLinks()}</div>
        </section>
      </PhoneListView>
    )
  }

  const brand = await getBrandBySlug(slug)
  if (!brand) notFound()
  const phones = sortPhones(all.filter((p) => p.brand.slug === slug))
  if (!phones.length) notFound()
  return (
    <PhoneListView
      title={`${brand.name} mobile prices in Pakistan`}
      description={brand.description ?? `Official prices in PKR and specs of ${brand.name} phones sold in Pakistan, ${year}.`}
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Prices', href: '/prices' }, { label: 'Mobile prices', href: '/mobile-prices' }, { label: brand.name, url: `/mobile-prices/${slug}` }]}
      phones={phones}
      brands={brandsWithPhones}
      active={{ brand: slug }}
      faqs={brandFaqs(brand, phones)}
    />
  )
}
