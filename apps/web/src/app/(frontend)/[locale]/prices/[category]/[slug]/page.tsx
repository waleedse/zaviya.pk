import { notFound } from 'next/navigation'
import { APPLIANCE_BRANDS } from '@zaviya/shared'
import { ApplianceListView, AppliancePageView } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
import {
  MIN_INDEXABLE_APPLIANCE_LIST,
  applianceIndexable,
  categoryBySlug,
  categoryFaqs,
  categorySummaries,
  productFaqs,
  similarAppliances,
  sortByPrice,
} from '@/lib/appliances/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; category: string; slug: string }> }

/** /prices/<category>/<brand> is a brand list; anything else is a product slug */
const isBrand = (slug: string) => APPLIANCE_BRANDS.some((b) => b.slug === slug)

export async function generateMetadata({ params }: Params) {
  const { locale: raw, category, slug } = await params
  const locale = parseLocale(raw)
  const cat = categoryBySlug(category)
  if (!cat) return { title: 'Not found', robots: { index: false } }
  const all = await getAppliances()
  const year = new Date().getFullYear()
  if (isBrand(slug)) {
    const items = all.filter((a) => a.category.slug === category && a.brand.slug === slug)
    const name = APPLIANCE_BRANDS.find((b) => b.slug === slug)!.name
    return buildPageMetadata({
      locale,
      title: `${name} ${cat.name} Prices in Pakistan ${year}`,
      description: `${items.length} ${name} ${cat.name.toLowerCase()} with official PKR prices from the ${name} Pakistan store, specs and a link to buy.`,
      enPath: `/prices/${category}/${slug}`,
      absoluteTitle: true,
      noindex: items.filter(applianceIndexable).length < MIN_INDEXABLE_APPLIANCE_LIST,
    })
  }
  const a = all.find((x) => x.slug === slug && x.category.slug === category)
  if (!a) return { title: 'Not found', robots: { index: false } }
  const full = `${a.brand.name} ${a.name}`
  return buildPageMetadata({
    locale,
    title: `${full} Price in Pakistan ${year}`,
    description: `${full} price in Pakistan: ${a.pricePkr ? `Rs ${a.pricePkr.toLocaleString('en-US')} on the official ${a.brand.name} store` : 'not shown by the brand yet'}. Specs, price history, similar ${cat.name.toLowerCase()} and where to buy.`.slice(0, 300),
    enPath: `/prices/${category}/${slug}`,
    ogImage: a.imageUrl,
    absoluteTitle: false,
    noindex: !applianceIndexable(a),
  })
}

export default async function ApplianceOrBrandPage({ params }: Params) {
  const { locale: raw, category, slug } = await params
  if (parseLocale(raw) === 'ur') notFound()
  const cat = categoryBySlug(category)
  if (!cat) notFound()
  const all = await getAppliances()
  if (isBrand(slug)) {
    const inCat = sortByPrice(all.filter((a) => a.category.slug === category))
    const items = inCat.filter((a) => a.brand.slug === slug)
    if (!items.length) notFound()
    const name = items[0]!.brand.name
    const brands = [...new Set(inCat.map((a) => a.brand.slug))].map((b) => ({ slug: b, name: inCat.find((a) => a.brand.slug === b)!.brand.name, count: inCat.filter((a) => a.brand.slug === b).length }))
    return (
      <ApplianceListView
        title={`${name} ${cat.name.toLowerCase()} prices in Pakistan`}
        description={`Official prices of ${items.length} ${name} ${cat.name.toLowerCase()} from the ${name} Pakistan store, cheapest first.`}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Prices', href: '/prices' }, { label: cat.name, href: `/prices/${category}` }, { label: name }]}
        items={items}
        summaries={categorySummaries(all)}
        category={cat}
        brands={brands}
        activeBrand={slug}
        faqs={categoryFaqs(cat, items, name)}
      />
    )
  }
  const a = all.find((x) => x.slug === slug && x.category.slug === category)
  if (!a) notFound()
  return <AppliancePageView a={a} similar={similarAppliances(a, all, 6)} faqs={productFaqs(a)} />
}
