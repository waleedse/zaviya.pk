import { notFound } from 'next/navigation'
import { ApplianceListView, AppliancePageView } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
import {
  MIN_INDEXABLE_APPLIANCE_LIST,
  applianceIndexable,
  categoryBySlug,
  categoryFaqs,
  categorySummaries,
  fullName,
  monthYear,
  productFaqs,
  sourceText,
  similarAppliances,
  sortByPrice,
} from '@/lib/appliances/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; category: string; slug: string }> }

/** /prices/<category>/<brand> is a brand list (a brand with items in this category); anything else is a product slug */
const isBrandIn = (all: { brand: { slug: string; kind: string }; category: { slug: string } }[], category: string, slug: string) =>
  all.some((a) => a.category.slug === category && a.brand.slug === slug && a.brand.kind !== 'source')

export async function generateMetadata({ params }: Params) {
  const { locale: raw, category, slug } = await params
  const locale = parseLocale(raw)
  const cat = categoryBySlug(category)
  if (!cat) return { title: 'Not found', robots: { index: false } }
  const all = await getAppliances()
  const when = monthYear()
  if (isBrandIn(all, category, slug)) {
    const items = all.filter((a) => a.category.slug === category && a.brand.slug === slug)
    const name = items[0]!.brand.name
    return buildPageMetadata({
      locale,
      title: `${name} ${cat.name} Prices in Pakistan ${when}`,
      description: `${items.length} ${name} ${cat.name.toLowerCase()} with official PKR prices from ${sourceText(items[0]!)}, specs, price history and comparisons.`,
      enPath: `/prices/${category}/${slug}`,
      absoluteTitle: true,
      noindex: items.filter(applianceIndexable).length < MIN_INDEXABLE_APPLIANCE_LIST,
    })
  }
  const a = all.find((x) => x.slug === slug && x.category.slug === category)
  if (!a) return { title: 'Not found', robots: { index: false } }
  const full = fullName(a)
  const grocery = a.brand.kind === 'source'
  const rs = a.pricePkr ? `Rs ${a.pricePkr.toLocaleString('en-US')}` : null
  const title = grocery ? `${a.name} Price Today in Pakistan (${when}): Lahore, Karachi, Islamabad` : `${full} Price in Pakistan ${when}`
  const description = grocery
    ? `${a.name} price today: ${rs ? `${rs} average this week` : 'no average this week'}, with the lowest and highest price in ${a.cityPrices.length || 17} cities from the PBS weekly survey, and the price history.`
    : `${full} price in Pakistan: ${rs ? `${rs} on ${sourceText(a)}` : 'not shown by the maker yet'}. ${a.category.group === 'vehicles' ? 'Variants, ex-factory price, price history and comparisons.' : `Specs, price history, similar ${cat.name.toLowerCase()} and where to buy.`}`
  return buildPageMetadata({
    locale,
    title,
    description: description.slice(0, 300),
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
  if (isBrandIn(all, category, slug)) {
    const inCat = sortByPrice(all.filter((a) => a.category.slug === category))
    const items = inCat.filter((a) => a.brand.slug === slug)
    if (!items.length) notFound()
    const name = items[0]!.brand.name
    const brands = [...new Set(inCat.map((a) => a.brand.slug))].map((b) => ({ slug: b, name: inCat.find((a) => a.brand.slug === b)!.brand.name, count: inCat.filter((a) => a.brand.slug === b).length }))
    return (
      <ApplianceListView
        title={`${name} ${cat.name.toLowerCase()} prices in Pakistan`}
        description={`Official prices of ${items.length} ${name} ${cat.name.toLowerCase()} from ${sourceText(items[0]!)}, cheapest first.`}
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
