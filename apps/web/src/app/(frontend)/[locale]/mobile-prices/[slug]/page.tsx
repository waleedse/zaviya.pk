import { notFound } from 'next/navigation'
import { PhoneListView, bandLinks } from '@/components/phones/PhoneViews'
import { getBrandBySlug, getBrands, getPhones } from '@/lib/phones/queries'
import { bandFaqs, brandFaqs } from '@/lib/phones/pages'
import { MIN_INDEXABLE_LIST, bandLabel, parseBandSlug, phonesUnder, sortPhones } from '@/lib/phones/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Params) {
  const { locale: raw, slug } = await params
  const locale = parseLocale(raw)
  const year = new Date().getFullYear()
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

  const band = parseBandSlug(slug)
  if (band) {
    const phones = phonesUnder(all, band)
    return (
      <PhoneListView
        title={`Best phones under Rs ${bandLabel(band)} in Pakistan`}
        description={`Phones with an official price of Rs ${bandLabel(band)} or less in Pakistan, ${year} prices in PKR, sorted by popularity.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mobile prices', href: '/mobile-prices' }, { label: `Under Rs ${bandLabel(band)}`, url: `/mobile-prices/${slug}` }]}
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
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Mobile prices', href: '/mobile-prices' }, { label: brand.name, url: `/mobile-prices/${slug}` }]}
      phones={phones}
      brands={brandsWithPhones}
      active={{ brand: slug }}
      faqs={brandFaqs(brand, phones)}
    />
  )
}
