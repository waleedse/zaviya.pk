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
import Link from 'next/link'
import { formatPkr } from '@zaviya/shared'
import { CategoryBar, HeroSearch, OfferTabs } from '@/components/prices/HubParts'
import { barCategories, bandDeals, catHref } from '@/lib/search/hub-data'
import { childrenOf, getCategoryTree } from '@/lib/search/categories'
import { popularItems } from '@/lib/search/hub'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const all = await getAppliances()
  return buildPageMetadata({
    locale,
    title: `Search Any Product, Save Money: Prices in Pakistan Today (${monthYear()}) | Zaviya`,
    description: `Search any product and see every Pakistani store that sells it, the cheapest price and who has it in stock. Best offers today, official atta, sugar, bike and car prices, mobiles, appliances, petrol, gold and dollar rates.`,
    enPath: '/prices',
    absoluteTitle: true,
  })
}

export default async function PricesHub({ params }: { params: Promise<{ locale: string }> }) {
  if (parseLocale((await params).locale) === 'ur') notFound()
  const [all, phones, groups, discounts, changes, tree, bands, hot] = await Promise.all([getAppliances(), getPhones(), offerGroupSummaries(), topDiscounts(12), recentOfferChanges(24), getCategoryTree(), bandDeals(), popularItems(9)])
  const bar = await barCategories(tree)
  const tops = childrenOf(tree, null).filter((c) => c.path !== 'Other')
  const catLinks = Object.fromEntries(tree.filter((c) => c.level >= 2).map((c) => [c.path, catHref(c.path)]))
  const totalProducts = tops.reduce((n, c) => n + c.products, 0)
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
      bar={<CategoryBar cats={bar} />}
      hero={
        <section className="border-b border-border bg-surface">
          <div className="container-wide flex max-w-[860px] flex-col items-center gap-4 py-12 text-center md:py-16">
            <h1 className="font-display text-[clamp(2.2rem,1.4rem+3vw,3.6rem)] font-extrabold leading-[1.05] tracking-tight">Search any product.<br /><span className="text-accent">Save money.</span></h1>
            <p className="max-w-[620px] text-base text-fg-muted md:text-lg">One search shows every Pakistani store that sells it, the cheapest price and who has it in stock.{totalProducts ? ` ${totalProducts.toLocaleString('en-US')} products, updated through the day.` : ''}</p>
            <div className="mt-2 w-full"><HeroSearch catLinks={catLinks} /></div>
            <div className="mt-1 flex flex-wrap justify-center gap-2 text-sm">
              <Link href="/prices/on-sale" className="rounded-full bg-breaking/10 px-3.5 py-2 font-bold text-breaking">Best offers today</Link>
              <Link href="/prices/on-sale?drop=1" className="rounded-full bg-amber-soft px-3.5 py-2 font-bold text-amber">Price dropped this week</Link>
              <Link href="/prices/on-sale?band=under-5k" className="rounded-full bg-accent-soft px-3.5 py-2 font-semibold text-accent">Under Rs 5,000</Link>
              <a href="#popular" className="rounded-full bg-accent-soft px-3.5 py-2 font-semibold text-accent">Compare two products</a>
              <a href="#official" className="rounded-full bg-surface-2 px-3.5 py-2 font-semibold">Official grocery rates</a>
            </div>
          </div>
        </section>
      }
      shop={
        <>
          <OfferTabs bands={bands} />
          <section id="popular" aria-labelledby="pop-h" className="scroll-mt-24">
            <h2 id="pop-h" className="font-display text-2xl font-extrabold md:text-3xl">Popular items, today's lowest prices</h2>
            <div className="card-surface mt-4 overflow-hidden">
              <ul className="grid md:grid-cols-2 lg:grid-cols-3">
                {hot.map((p) => (
                  <li key={p.id} className="border-b border-border md:border-r">
                    <Link href={`/product/${p.id}`} className="flex items-center gap-3.5 px-5 py-4 hover:bg-surface-2">
                      <span className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-xl bg-white">{p.image ? <img src={p.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</span>
                      <span className="min-w-0 flex-1"><span className="line-clamp-1 text-[15px] font-semibold">{p.title}</span><span className="text-xs text-fg-muted">{p.stores} stores</span></span>
                      <span className="text-right"><span className="block text-[17px] font-extrabold">{formatPkr(p.price)}</span>{p.offPct >= 5 ? <span className="text-xs font-bold text-up">{p.offPct}% off</span> : null}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section aria-labelledby="cats-h">
            <h2 id="cats-h" className="font-display text-2xl font-extrabold md:text-3xl">Shop by category</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {[...tops.slice(0, 11), { path: 'on-sale', name: 'On sale', products: 0, imageUrl: null, urlPath: '' }].map((c) => (
                <Link key={c.path} href={c.path === 'on-sale' ? '/prices/on-sale' : catHref(c.path)} className="card-surface flex flex-col gap-2 p-3">
                  <span className="flex h-24 items-center justify-center overflow-hidden rounded-xl bg-surface-2">{c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</span>
                  <span className="text-[15px] font-bold">{c.name}</span>
                  <span className="text-xs text-fg-muted">{c.products ? `${c.products.toLocaleString('en-US')} products` : 'Best offers today'}</span>
                </Link>
              ))}
            </div>
          </section>
          <div id="official" className="scroll-mt-24"><ShopByCategory tiles={tiles} title="Official prices and brand stores" /></div>
        </>
      }
      deals={
        <>
          <OfferStrip title="Price drops this week" sub="Store prices that came down in the last 7 days." items={drops} />
          <OfferStrip title="Biggest discounts right now" sub="Real cuts against the store's own crossed-out price, in stock today." items={discounts} />
        </>
      }
    />
  )
}
