import { notFound } from 'next/navigation'
import { ApplianceHubView } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
import { getPhones } from '@/lib/phones/queries'
import { categorySummaries, hubFaqs } from '@/lib/appliances/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const all = await getAppliances()
  const year = new Date().getFullYear()
  return buildPageMetadata({
    locale,
    title: `Prices in Pakistan Today ${year}: Mobiles, AC, Fridge, Geyser, Petrol, Gold`,
    description: `All prices in one place: mobile phones and ${all.length || 'the latest'} home appliances (AC, fridge, washing machine, geyser, heater) from the brands' own stores, plus today's petrol, gold, dollar and chicken rates.`,
    enPath: '/prices',
    absoluteTitle: true,
  })
}

export default async function PricesHub({ params }: { params: Promise<{ locale: string }> }) {
  if (parseLocale((await params).locale) === 'ur') notFound()
  const [all, phones] = await Promise.all([getAppliances(), getPhones()])
  const phonePrices = phones.map((p) => p.pricePkr).filter((n): n is number => typeof n === 'number' && n > 0)
  const phoneSummary = { count: phones.length, minPrice: phonePrices.length ? Math.min(...phonePrices) : null, brands: [...new Set(phones.map((p) => p.brand.name))] }
  const weekAgo = Date.now() - 7 * 86_400_000
  const latest = all
    .filter((a) => a.pricePkr && a.priceHistory.length > 1 && Date.parse(a.priceHistory[0]!.date) > weekAgo)
    .slice(0, 10)
  return <ApplianceHubView summaries={categorySummaries(all)} latest={latest} faqs={hubFaqs(all.length)} phones={phoneSummary} />
}
