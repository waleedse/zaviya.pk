import Link from 'next/link'
import {
  ArrowRight,
  BadgePercent,
  Cable,
  Camera,
  CookingPot,
  ExternalLink,
  Gamepad2,
  Headphones,
  HeartPulse,
  Keyboard,
  Laptop,
  Package,
  Refrigerator,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Speaker,
  Store,
  Tablet,
  ToyBrick,
  TrendingDown,
  TrendingUp,
  Tv,
  Watch,
  type LucideIcon,
} from 'lucide-react'
import { OFFER_GROUPS, formatPkr, offerGroupInfo, type FAQ } from '@zaviya/shared'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { JsonLd } from '@/components/seo/JsonLd'
import { PageHero } from '@/components/layout/PageHero'
import { PriceSearch } from '@/components/appliances/PriceSearch'
import { StoreOffersTable } from '@/components/offers/StoreOffers'
import { OFFER_PAGE_SIZE, type OfferSort, type OfferView } from '@/lib/offers/queries'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { shortTitle } from '@/lib/offers/copy'
import { cn } from '@/lib/utils'

/**
 * Store shop pages (15 Nov 2026): "shop by category" tiles, /prices/shop/<group> lists and /prices/item/<slug>
 * product pages. Every price and picture is the store's own listing, always with a link to that store.
 */

const COLOR = '#0f766e'
export const shopHref = (group: string) => `/prices/shop/${group}`
export const offerHref = (slug: string) => `/prices/item/${slug}`

export const GROUP_ICONS: Record<string, LucideIcon> = {
  mobiles: Smartphone,
  laptops: Laptop,
  tablets: Tablet,
  computer: Keyboard,
  smartwatches: Watch,
  audio: Headphones,
  speakers: Speaker,
  tvs: Tv,
  cameras: Camera,
  gaming: Gamepad2,
  accessories: Cable,
  'home-appliances': Refrigerator,
  kitchen: CookingPot,
  beauty: Sparkles,
  health: HeartPulse,
  toys: ToyBrick,
  grocery: ShoppingBasket,
  other: Package,
}

const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }) : '')

/** "18% off" when the store shows a higher crossed-out price */
export function offPct(o: Pick<OfferView, 'pricePkr' | 'listPricePkr'>): number | null {
  if (!o.pricePkr || !o.listPricePkr || o.listPricePkr <= o.pricePkr) return null
  const pct = Math.round(((o.listPricePkr - o.pricePkr) / o.listPricePkr) * 100)
  return pct >= 3 && pct <= 90 ? pct : null
}

// ---------- category tiles ----------

export interface ShopTile {
  href: string
  name: string
  ur?: string
  count?: number
  minPrice?: number | null
  imageUrl?: string | null
  icon: LucideIcon
}

/** The big "Shop by category" grid at the top of /prices: icon, name in English and Urdu, how many items, from what price */
export function ShopByCategory({ tiles, title = 'Shop by category' }: { tiles: ShopTile[]; title?: string }) {
  if (!tiles.length) return null
  return (
    <section aria-labelledby="shop-cats" data-testid="shop-categories">
      <h2 id="shop-cats" className="font-display text-xl font-bold md:text-2xl">
        {title}
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {tiles.map((t) => {
          const Icon = t.icon
          return (
            <li key={t.href}>
              <Link href={t.href} className="card-lift group relative flex h-full min-h-[132px] flex-col overflow-hidden p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: COLOR }} aria-hidden>
                    <Icon className="h-5 w-5" />
                  </span>
                  {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-14 w-14 rounded-lg bg-white object-contain p-0.5 transition group-hover:scale-105" />
                  ) : null}
                </div>
                <span className="mt-2 font-display text-[0.95rem] font-bold leading-tight group-hover:text-accent">{t.name}</span>
                {t.ur ? (
                  <span className="text-xs text-fg-subtle" lang="ur">
                    {t.ur}
                  </span>
                ) : null}
                <span className="mt-auto pt-1 text-xs text-fg-muted tabular-nums">
                  {t.count ? `${t.count.toLocaleString('en-US')} items` : ''}
                  {t.count && t.minPrice ? ' · ' : ''}
                  {t.minPrice ? `from ${formatPkr(t.minPrice)}` : ''}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---------- product cards ----------

export function OfferCard({ o, priority = false }: { o: OfferView; priority?: boolean }) {
  const off = offPct(o)
  const moved = o.prevPricePkr && o.pricePkr && o.prevPricePkr !== o.pricePkr ? o.pricePkr - o.prevPricePkr : 0
  return (
    <Link href={offerHref(o.slug)} className="card-lift group flex h-full flex-col p-3" data-testid="offer-card">
      <div className="img-zoom relative flex h-[150px] items-center justify-center rounded-xl bg-white">
        {o.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.imageUrl} alt={o.title} loading={priority ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" className="h-[140px] w-full object-contain p-1" />
        ) : (
          <Package className="h-10 w-10 text-fg-subtle" aria-hidden />
        )}
        {off ? <span className="absolute start-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-bold text-white">{off}% off</span> : null}
      </div>
      <p className="mt-2 truncate text-xs font-semibold uppercase tracking-wider text-fg-subtle">{o.brand || offerGroupInfo(o.group)?.name || o.storeName}</p>
      <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug group-hover:text-accent">{o.title}</h3>
      <div className="mt-auto pt-2">
        <p className="font-display text-lg font-extrabold tabular-nums">{o.pricePkr ? formatPkr(o.pricePkr) : 'Price on store'}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle tabular-nums">
          {o.listPricePkr && off ? <span className="line-through">{formatPkr(o.listPricePkr)}</span> : null}
          {moved ? (
            <span className={cn('inline-flex items-center gap-0.5 font-semibold', moved < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {moved < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : <TrendingUp className="h-3.5 w-3.5" aria-hidden />}
              {formatPkr(Math.abs(moved))}
            </span>
          ) : null}
          <span>{o.inStock === false ? 'Out of stock' : o.storeName}</span>
        </p>
      </div>
    </Link>
  )
}

export function OfferGrid({ items }: { items: OfferView[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((o, i) => (
        <OfferCard key={o.slug} o={o} priority={i < 6} />
      ))}
    </div>
  )
}

/** A row of store deals on the hub ("Biggest discounts", "Price drops") with a link to the full list */
export function OfferStrip({ title, sub, items: all, more }: { title: string; sub?: string; items: OfferView[]; more?: { href: string; label: string } }) {
  // whole rows of 6 (the widest grid), so no single card hangs on its own row
  const items = all.length > 6 ? all.slice(0, Math.floor(all.length / 6) * 6) : all
  if (!items.length) return null
  return (
    <section aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold md:text-2xl">{title}</h2>
          {sub ? <p className="mt-1 text-sm text-fg-muted">{sub}</p> : null}
        </div>
        {more ? (
          <Link href={more.href} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            {more.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="mt-4">
        <OfferGrid items={items} />
      </div>
    </section>
  )
}

// ---------- /prices/shop/<group> ----------

const SORTS: { value: OfferSort; label: string }[] = [
  { value: 'popular', label: 'Popular' },
  { value: 'low', label: 'Price: low to high' },
  { value: 'high', label: 'Price: high to low' },
  { value: 'drops', label: 'Price drops' },
]

function query(base: string, p: { brand?: string; sort?: OfferSort; page?: number }) {
  const q = new URLSearchParams()
  if (p.brand) q.set('brand', p.brand)
  if (p.sort && p.sort !== 'popular') q.set('sort', p.sort)
  if (p.page && p.page > 1) q.set('page', String(p.page))
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

export function ShopGroupView({
  group,
  items,
  total,
  brands,
  brand,
  sort = 'popular',
  page = 1,
  minPrice,
  faqs,
}: {
  group: string
  items: OfferView[]
  total: number
  brands: { name: string; count: number }[]
  brand?: string
  sort?: OfferSort
  page?: number
  minPrice: number | null
  faqs: FAQ[]
}) {
  const info = offerGroupInfo(group)!
  const Icon = GROUP_ICONS[group] ?? Package
  const base = shopHref(group)
  const pages = Math.max(1, Math.ceil(total / OFFER_PAGE_SIZE))
  const title = `${info.name}${brand ? `: ${brand}` : ''} prices in Pakistan`
  const stores = [...new Set(items.map((o) => o.storeName))]
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'Prices', url: '/prices' },
            { name: info.name, url: base },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: title,
            itemListElement: items.slice(0, 30).map((o, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluteUrl(offerHref(o.slug)), name: o.title })),
          },
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <PageHero
        title={title}
        description={
          <>
            {total.toLocaleString('en-US')} items from Pakistani store websites{minPrice ? `, from ${formatPkr(minPrice)}` : ''}. Prices are checked through the day; every item links to the store
            that sells it. <span lang="ur">{info.ur}</span>
          </>
        }
        icon={Icon}
        color={COLOR}
        eyebrow="Store prices"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Prices', href: '/prices' }, { label: info.name }]}
        stats={[
          { label: 'Items', value: total.toLocaleString('en-US') },
          ...(stores.length ? [{ label: 'Stores', value: stores.length }] : []),
        ]}
      >
        <PriceSearch className="mt-5 max-w-[640px]" />
      </PageHero>
      <div className="container-wide mt-6 space-y-5">
        <nav aria-label="Store categories" className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          <Link href="/prices" className="chip whitespace-nowrap">
            All prices
          </Link>
          {OFFER_GROUPS.filter((g) => g.slug !== 'other').map((g) => (
            <Link key={g.slug} href={shopHref(g.slug)} className={cn('chip whitespace-nowrap', g.slug === group && 'border-transparent bg-accent text-accent-fg')} aria-current={g.slug === group ? 'page' : undefined}>
              {g.name}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {brands.length > 1 ? (
            <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="list" aria-label="Brands">
              <Link href={query(base, { sort })} role="listitem" className={cn('chip', !brand && 'border-transparent bg-fg text-bg')}>
                All brands
              </Link>
              {brands.map((b) => (
                <Link key={b.name} href={query(base, { brand: b.name, sort })} role="listitem" className={cn('chip whitespace-nowrap', brand?.toLowerCase() === b.name.toLowerCase() && 'border-transparent bg-fg text-bg')}>
                  {b.name} <span className="text-fg-subtle">{b.count}</span>
                </Link>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-1.5 text-sm" role="list" aria-label="Sort">
            {SORTS.map((s) => (
              <Link key={s.value} role="listitem" href={query(base, { brand, sort: s.value })} className={cn('rounded-lg px-2.5 py-1.5 font-medium transition hover:text-accent', sort === s.value ? 'bg-accent-soft text-accent' : 'text-fg-muted')} rel="nofollow">
                {s.label}
              </Link>
            ))}
          </div>
        </div>
        {items.length ? <OfferGrid items={items} /> : <p className="rounded-2xl border border-border bg-surface p-6 text-fg-muted">Nothing listed here yet. New items are added as the stores are read.</p>}
        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center justify-center gap-2 pt-2">
            {page > 1 ? (
              <Link href={query(base, { brand, sort, page: page - 1 })} className="chip">
                ← Previous
              </Link>
            ) : null}
            <span className="text-sm text-fg-muted">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={query(base, { brand, sort, page: page + 1 })} className="chip">
                Next →
              </Link>
            ) : null}
          </nav>
        ) : null}
        <p className="rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed text-fg-muted">
          <Store className="me-1 inline h-4 w-4" aria-hidden /> Prices and pictures come from each store&apos;s own website and are checked several times a day. Zaviya does not sell anything and
          does not earn from these links. Always confirm the price, warranty and PTA status with the store before you pay.
        </p>
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

// ---------- /prices/item/<slug> ----------

export function OfferPageView({ o, stores, similar, faqs }: { o: OfferView; stores: OfferView[]; similar: OfferView[]; faqs: FAQ[] }) {
  const name = shortTitle(o.title)
  const info = offerGroupInfo(o.group) ?? offerGroupInfo('other')!
  const off = offPct(o)
  const cheapest = stores.find((s) => s.inStock !== false && s.pricePkr)?.pricePkr ?? o.pricePkr
  const moved = o.prevPricePkr && o.pricePkr && o.prevPricePkr !== o.pricePkr ? o.pricePkr - o.prevPricePkr : 0
  const prices = stores.map((s) => s.pricePkr).filter((n): n is number => !!n)
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: o.title,
    ...(o.imageUrl ? { image: [o.imageUrl] } : {}),
    ...(o.brand ? { brand: { '@type': 'Brand', name: o.brand } } : {}),
    category: info.name,
    offers:
      prices.length > 1
        ? { '@type': 'AggregateOffer', priceCurrency: 'PKR', lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length }
        : {
            '@type': 'Offer',
            priceCurrency: 'PKR',
            price: o.pricePkr ?? undefined,
            url: o.url,
            availability: o.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
            seller: { '@type': 'Organization', name: o.storeName },
          },
  }
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'Prices', url: '/prices' },
            { name: info.name, url: shopHref(info.slug) },
            { name, url: offerHref(o.slug) },
          ]),
          productLd,
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <div className="container-wide pt-6">
        <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
          <Link href="/" className="hover:text-accent">
            Home
          </Link>{' '}
          ›{' '}
          <Link href="/prices" className="hover:text-accent">
            Prices
          </Link>{' '}
          ›{' '}
          <Link href={shopHref(info.slug)} className="hover:text-accent">
            {info.name}
          </Link>
        </nav>
        <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,420px)_1fr] md:gap-10">
          <div className="relative flex aspect-square items-center justify-center rounded-2xl border border-border bg-white p-4">
            {o.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.imageUrl} alt={o.title} decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
            ) : (
              <Package className="h-16 w-16 text-fg-subtle" aria-hidden />
            )}
            {off ? <span className="absolute start-3 top-3 rounded-lg bg-emerald-600 px-2 py-1 text-sm font-bold text-white">{off}% off</span> : null}
          </div>
          <div className="min-w-0">
            {o.brand ? <p className="text-sm font-semibold uppercase tracking-wider text-fg-subtle">{o.brand}</p> : null}
            <h1 className="font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.3rem)] font-extrabold leading-tight">{name} price in Pakistan</h1>
            {name !== o.title ? <p className="mt-2 text-sm leading-relaxed text-fg-muted">{o.title}</p> : null}
            <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="font-display text-4xl font-extrabold tabular-nums" data-testid="offer-price">
                {o.pricePkr ? formatPkr(o.pricePkr) : 'Price on store'}
              </p>
              {o.listPricePkr && off ? <p className="pb-1 text-lg text-fg-subtle line-through tabular-nums">{formatPkr(o.listPricePkr)}</p> : null}
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              at {o.storeName} · {o.inStock === false ? 'out of stock' : 'in stock'}
              {o.seenAt ? ` · checked ${dateText(o.seenAt)}` : ''}
            </p>
            {moved ? (
              <p className={cn('mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold', moved < 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400')}>
                {moved < 0 ? <TrendingDown className="h-4 w-4" aria-hidden /> : <TrendingUp className="h-4 w-4" aria-hidden />}
                {moved < 0 ? 'Down' : 'Up'} {formatPkr(Math.abs(moved))} from {formatPkr(o.prevPricePkr!)}
                {o.priceChangedAt ? ` on ${dateText(o.priceChangedAt)}` : ''}
              </p>
            ) : null}
            {stores.length > 1 && cheapest && cheapest < (o.pricePkr ?? Infinity) ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-sm font-semibold text-accent">
                <BadgePercent className="h-4 w-4" aria-hidden /> Cheaper elsewhere: {formatPkr(cheapest)}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={o.url} target="_blank" rel="noopener nofollow" className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-fg transition hover:opacity-90" data-testid="visit-store">
                See it on {o.storeName} <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
              <Link href={shopHref(info.slug)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 font-semibold transition hover:border-accent hover:text-accent">
                More {info.name.toLowerCase()}
              </Link>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-border p-3">
                <dt className="text-fg-subtle">Category</dt>
                <dd className="font-semibold">{info.name}</dd>
              </div>
              <div className="rounded-xl border border-border p-3">
                <dt className="text-fg-subtle">Stores</dt>
                <dd className="font-semibold">{stores.length}</dd>
              </div>
              {prices.length > 1 ? (
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-fg-subtle">Price range</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatPkr(Math.min(...prices))} to {formatPkr(Math.max(...prices))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
        <div className="mt-10 space-y-10">
          <StoreOffersTable offers={stores} name={name} />
          {similar.length ? <OfferStrip title={`Similar ${info.name.toLowerCase()} at this price`} items={similar} more={{ href: shopHref(info.slug), label: `All ${info.name.toLowerCase()}` }} /> : null}
          <p className="rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed text-fg-muted">
            This price is read from {o.storeName}&apos;s own website. Zaviya does not sell this product and does not earn from the link. Prices can change at any time; check the final price, warranty and
            delivery charges on the store before you pay.
          </p>
          <FAQAccordion faqs={faqs} locale="en" />
        </div>
      </div>
    </div>
  )
}
