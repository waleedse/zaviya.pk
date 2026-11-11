import { notFound } from 'next/navigation'
import { ApplianceHubView } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
import { getPhones } from '@/lib/phones/queries'
import { categorySummaries, hubFaqs, monthYear, trendingItems } from '@/lib/appliances/logic'
import { cityBaskets } from '@/lib/appliances/basket'
import { topMovers } from '@/lib/appliances/movers'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const all = await getAppliances()
  return buildPageMetadata({
    locale,
    title: `Prices in Pakistan Today (${monthYear()}): Atta, Sugar, Bikes, Cars, Mobiles, AC, Petrol, Gold`,
    description: `Official prices in one place: atta, sugar, ghee, milk, eggs and LPG in 17 cities, Honda bike and Toyota car prices, mobile phones, ${all.length || 'hundreds of'} items from the brands' own stores, plus today's petrol, gold and dollar rates.`,
    enPath: '/prices',
    absoluteTitle: true,
  })
}

export default async function PricesHub({ params }: { params: Promise<{ locale: string }> }) {
  if (parseLocale((await params).locale) === 'ur') notFound()
  const [all, phones] = await Promise.all([getAppliances(), getPhones()])
  const phonePrices = phones.map((p) => p.pricePkr).filter((n): n is number => typeof n === 'number' && n > 0)
  const phoneSummary = { count: phones.length, minPrice: phonePrices.length ? Math.min(...phonePrices) : null, brands: [...new Set(phones.map((p) => p.brand.name))] }
  const pbs = all.filter((a) => a.brand.kind === 'source' && a.cityPrices.length)
  const popular = trendingItems(all, 10)
  const fallback = [...all].filter((a) => a.pricePkr).sort((a, b) => b.popularity - a.popularity).slice(0, 10)
  const basketUpdated = pbs.map((a) => a.priceUpdatedAt).filter(Boolean).sort().at(-1)
  return <ApplianceHubView summaries={categorySummaries(all)} movers={topMovers(all, 5)} baskets={cityBaskets(pbs)} basketUpdated={basketUpdated} trending={popular.length >= 4 ? popular : fallback} faqs={hubFaqs(all.length)} phones={phoneSummary} />
}
