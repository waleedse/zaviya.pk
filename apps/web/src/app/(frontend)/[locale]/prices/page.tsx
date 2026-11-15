import { Bike, Refrigerator, ShoppingBasket, Smartphone } from 'lucide-react'
import { OFFER_GROUPS } from '@zaviya/shared'
import { offerGroupSummaries, recentOfferChanges, topDiscounts } from '@/lib/offers/queries'
import { GROUP_ICONS, OfferStrip, ShopByCategory, shopHref, type ShopTile } from '@/components/offers/OfferViews'
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
  const [all, phones, groups, discounts, changes] = await Promise.all([getAppliances(), getPhones(), offerGroupSummaries(), topDiscounts(12), recentOfferChanges(24)])
  const phonePrices = phones.map((p) => p.pricePkr).filter((n): n is number => typeof n === 'number' && n > 0)
  const phoneSummary = { count: phones.length, minPrice: phonePrices.length ? Math.min(...phonePrices) : null, brands: [...new Set(phones.map((p) => p.brand.name))] }
  const pbs = all.filter((a) => a.brand.kind === 'source' && a.cityPrices.length)
  const popular = trendingItems(all, 10)
  const fallback = [...all].filter((a) => a.pricePkr).sort((a, b) => b.popularity - a.popularity).slice(0, 10)
  const basketUpdated = pbs.map((a) => a.priceUpdatedAt).filter(Boolean).sort().at(-1)
  const summaries = categorySummaries(all)
  const count = (g: string) => summaries.filter((s) => s.category.group === g).reduce((n, s) => n + s.count, 0)

  // Our own price pages first (phones, PBS groceries, bikes and cars, brand appliances), then every store category by size
  const tiles: ShopTile[] = [
    { href: '/mobile-prices', name: 'Mobile phones', ur: 'موبائل فون', count: phoneSummary.count + (groups.find((g) => g.slug === 'mobiles')?.count ?? 0), minPrice: phoneSummary.minPrice, imageUrl: groups.find((g) => g.slug === 'mobiles')?.imageUrl, icon: Smartphone },
    ...(count('groceries') ? [{ href: '#groceries', name: 'Groceries (official)', ur: 'راشن', count: count('groceries'), icon: ShoppingBasket }] : []),
    ...(count('vehicles') ? [{ href: '#vehicles', name: 'Bikes & cars', ur: 'گاڑیاں', count: count('vehicles'), icon: Bike }] : []),
    ...(count('appliances') ? [{ href: '#appliances', name: 'Appliances (brand stores)', ur: 'گھریلو مشینیں', count: count('appliances'), icon: Refrigerator }] : []),
    ...OFFER_GROUPS.filter((g) => g.slug !== 'mobiles' && g.slug !== 'other')
      .map((g) => ({ g, s: groups.find((x) => x.slug === g.slug) }))
      .filter((x) => (x.s?.count ?? 0) >= 3)
      .sort((a, b) => b.s!.count - a.s!.count)
      .map(({ g, s }) => ({ href: shopHref(g.slug), name: g.name, ur: g.ur, count: s!.count, minPrice: s!.minPrice, imageUrl: s!.imageUrl, icon: GROUP_ICONS[g.slug]! })),
  ]
  const drops = changes.filter((o) => o.inStock !== false && o.pricePkr! < o.prevPricePkr!).slice(0, 12)
  return (
    <ApplianceHubView
      summaries={summaries}
      movers={topMovers(all, 5)}
      baskets={cityBaskets(pbs)}
      basketUpdated={basketUpdated}
      trending={popular.length >= 4 ? popular : fallback}
      faqs={hubFaqs(all.length)}
      phones={phoneSummary}
      shop={<ShopByCategory tiles={tiles} />}
      deals={
        <>
          <OfferStrip title="Price drops this week" sub="Store prices that came down in the last 7 days." items={drops} />
          <OfferStrip title="Biggest discounts right now" sub="Real cuts against the store's own crossed-out price, in stock today." items={discounts} />
        </>
      }
    />
  )
}
