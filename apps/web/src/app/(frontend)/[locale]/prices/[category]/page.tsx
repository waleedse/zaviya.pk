import { notFound } from 'next/navigation'
import { ApplianceListView } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
import { MIN_INDEXABLE_APPLIANCE_LIST, applianceIndexable, categoryBySlug, categoryFaqs, categorySummaries, sortByPrice } from '@/lib/appliances/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; category: string }> }

export async function generateMetadata({ params }: Params) {
  const { locale: raw, category } = await params
  const cat = categoryBySlug(category)
  if (!cat) return { title: 'Not found', robots: { index: false } }
  const items = (await getAppliances()).filter((a) => a.category.slug === category)
  const year = new Date().getFullYear()
  const brands = [...new Set(items.map((a) => a.brand.name))]
  return buildPageMetadata({
    locale: parseLocale(raw),
    title: `${cat.name} Prices in Pakistan ${year}: Latest ${cat.singular} Price List`,
    description: `${items.length} ${cat.name.toLowerCase()} with official PKR prices${brands.length ? ` from ${brands.join(', ')}` : ''}: price list, specs, price history and a link to buy from the brand's store.`,
    enPath: `/prices/${category}`,
    absoluteTitle: true,
    noindex: items.filter(applianceIndexable).length < MIN_INDEXABLE_APPLIANCE_LIST,
  })
}

export default async function CategoryPage({ params }: Params) {
  const { locale: raw, category } = await params
  if (parseLocale(raw) === 'ur') notFound()
  const cat = categoryBySlug(category)
  if (!cat) notFound()
  const all = await getAppliances()
  const items = sortByPrice(all.filter((a) => a.category.slug === category))
  if (!items.length) notFound()
  const brands = [...new Set(items.map((a) => a.brand.slug))].map((slug) => ({ slug, name: items.find((a) => a.brand.slug === slug)!.brand.name, count: items.filter((a) => a.brand.slug === slug).length }))
  const year = new Date().getFullYear()
  return (
    <ApplianceListView
      title={`${cat.name} prices in Pakistan ${year}`}
      description={`Official prices of ${items.length} ${cat.name.toLowerCase()} from the brands' own Pakistan stores, cheapest first, checked every day.`}
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Prices', href: '/prices' }, { label: cat.name }]}
      items={items}
      summaries={categorySummaries(all)}
      category={cat}
      brands={brands}
      faqs={categoryFaqs(cat, items)}
    />
  )
}
