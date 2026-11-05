import { notFound } from 'next/navigation'
import { ApplianceHubView } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
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
    title: `Home Appliance Prices in Pakistan ${year}: AC, Fridge, Geyser, Washing Machine`,
    description: `Official PKR prices of ${all.length || 'the latest'} home appliances in Pakistan, read daily from brand stores: ACs, refrigerators, washing machines, geysers, heaters, air coolers and kitchen appliances, with a link to buy.`,
    enPath: '/prices',
    absoluteTitle: true,
    noindex: all.length === 0,
  })
}

export default async function PricesHub({ params }: { params: Promise<{ locale: string }> }) {
  if (parseLocale((await params).locale) === 'ur') notFound()
  const all = await getAppliances()
  const weekAgo = Date.now() - 7 * 86_400_000
  const latest = all
    .filter((a) => a.pricePkr && a.priceHistory.length > 1 && Date.parse(a.priceHistory[0]!.date) > weekAgo)
    .slice(0, 10)
  return <ApplianceHubView summaries={categorySummaries(all)} latest={latest} faqs={hubFaqs(all.length)} />
}
