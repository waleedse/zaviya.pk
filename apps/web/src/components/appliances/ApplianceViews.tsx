import Link from 'next/link'
import { ArrowRight, ExternalLink, Plug } from 'lucide-react'
import { PRICE_GROUPS, formatPkr, type FAQ, type PriceGroupSlug } from '@zaviya/shared'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { PageHero } from '@/components/layout/PageHero'
import { JsonLd } from '@/components/seo/JsonLd'
import { hostOf } from '@/components/phones/PhoneParts'
import { PriceSearch } from '@/components/appliances/PriceSearch'
import { ChangeBadge, MoverRow, PriceTrendSection, WhatsAppShare, seriesOf } from '@/components/appliances/PriceParts'
import { CityBarChart } from '@/components/appliances/PriceCharts'
import type { CityBasket } from '@/lib/appliances/basket'
import type { Mover } from '@/lib/appliances/movers'
import { buildSeries, changeOver } from '@/lib/appliances/series'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { cn } from '@/lib/utils'
import {
  applianceSummary,
  bulkPrice,
  compareKey,
  compareSpecRows,
  compareVerdict,
  discountText,
  fullName,
  priceText,
  sourceText,
  type ApplianceView,
  type CategorySummary,
} from '@/lib/appliances/logic'
import { cityHref, hasCityPages } from '@/lib/appliances/cities'
import { itemH1 } from '@/lib/appliances/searchNames'

const COLOR = '#0f766e'
export const PRICES_HUB = '/prices'
export const categoryHref = (slug: string) => `/prices/${slug}`
export const applianceHref = (a: Pick<ApplianceView, 'slug' | 'category'>) => `/prices/${a.category.slug}/${a.slug}`
export const brandListHref = (category: string, brand: string) => `/prices/${category}/${brand}`
export const compareHref = (a: string, b: string) => `/prices/compare/${compareKey(a, b)}`

const dateText = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }) : ''

function itemListJsonLd(name: string, items: ApplianceView[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: fullName(a), url: absoluteUrl(applianceHref(a)) })),
  }
}

/** Product markup only for things a brand sells; a statistics average (PBS) is not an offer */
function productJsonLd(a: ApplianceView) {
  if (a.brand.kind === 'source') return null
  const url = absoluteUrl(applianceHref(a))
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: fullName(a),
    brand: { '@type': 'Brand', name: a.brand.name },
    category: a.category.name,
    ...(a.model ? { mpn: a.model } : {}),
    ...(a.imageUrl ? { image: a.imageUrl } : {}),
    description: applianceSummary(a),
    url,
    ...(a.pricePkr
      ? {
          offers: {
            '@type': 'Offer',
            url: a.officialUrl,
            priceCurrency: 'PKR',
            price: String(a.pricePkr),
            availability: a.inStock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'Organization', name: a.brand.kind === 'maker' ? `${a.brand.name} Pakistan` : `${a.brand.name} Pakistan (official store)` },
          },
        }
      : {}),
  }
}

/** Dataset markup for an official statistic with a real history: who publishes it, the period, what is measured */
function datasetJsonLd(a: ApplianceView) {
  if (a.brand.kind !== 'source') return null
  const series = buildSeries(a.priceHistory, a.pricePkr, a.priceUpdatedAt).filter((p) => p.real)
  if (series.length < 3) return null
  const day = (t: number) => new Date(t).toISOString().slice(0, 10)
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${a.name}: average price in Pakistan, ${series.length} recorded points`,
    description: `Average price of ${a.name.toLowerCase()} in Pakistan (PKR) from the Pakistan Bureau of Statistics weekly Sensitive Price Indicator, ${day(series[0]!.t)} to ${day(series.at(-1)!.t)}.`,
    url: absoluteUrl(applianceHref(a)),
    creator: { '@type': 'Organization', name: 'Pakistan Bureau of Statistics', url: 'https://www.pbs.gov.pk/' },
    isBasedOn: a.officialUrl,
    temporalCoverage: `${day(series[0]!.t)}/${day(series.at(-1)!.t)}`,
    spatialCoverage: { '@type': 'Country', name: 'Pakistan' },
    variableMeasured: { '@type': 'PropertyValue', name: 'Average price', unitText: 'PKR' },
  }
}

const SOURCING: Record<PriceGroupSlug | 'all', string> = {
  all: "Every price comes from an official source: the brands' own Pakistan stores (appliances, motorcycles), the makers' own price lists (cars) and the Pakistan Bureau of Statistics' weekly survey of 17 cities (groceries). We check them every day, keep the price history and link to the source. Shop and market prices can be higher or lower.",
  appliances: "Prices are the PKR prices shown on each brand's own Pakistan store. We read them every day, keep the price history, and link you to the official product page to buy. Dealer and market prices can be higher or lower. Brands that do not publish prices online are not listed yet.",
  vehicles: "Motorcycle prices are the retail prices on the maker's own store; car prices are the ex-factory prices on the maker's own price list (registration, withholding tax and freight are extra). We check them every day and keep the price history. Dealers may charge more for early delivery (\"own money\").",
  groceries: "Grocery prices come from the Pakistan Bureau of Statistics' Sensitive Price Indicator: prices collected every week in 50 markets of 17 cities. We show the national average and each city's lowest, average and highest price. Your local shop may differ.",
}

/** Where every number on these pages comes from */
export function ApplianceSourcingNote({ group = 'all' }: { group?: PriceGroupSlug | 'all' }) {
  return <p className="rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed text-fg-muted">{SOURCING[group]}</p>
}

export function ApplianceImage({ a, size = 160, priority = false, className }: { a: Pick<ApplianceView, 'imageUrl' | 'name' | 'brand'>; size?: number; priority?: boolean; className?: string }) {
  if (!a.imageUrl)
    return (
      <span className={cn('flex items-center justify-center rounded-xl bg-surface-2 text-fg-subtle', className)} style={{ width: size, height: size }} aria-hidden>
        <Plug className="h-1/3 w-1/3" />
      </span>
    )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={a.imageUrl}
      alt={a.brand.kind === 'source' ? a.name : `${a.brand.name} ${a.name}`}
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      className={cn('object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}

/** "Buy from the official store": the brand's own product page, never a reseller */
export function BuyButton({ url, brand, className }: { url: string; brand: string; className?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener nofollow"
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-fg transition hover:opacity-90', className)}
      data-testid="buy"
    >
      Buy from {brand} official store <ExternalLink className="h-4 w-4" aria-hidden />
    </a>
  )
}

/** The button under every price: buy on the brand store, see the maker's price list, or read the official release */
export function OfficialLink({ a, className }: { a: Pick<ApplianceView, 'officialUrl' | 'brand'>; className?: string }) {
  if (a.brand.kind === 'store') return <BuyButton url={a.officialUrl} brand={a.brand.name} className={className} />
  const label = a.brand.kind === 'maker' ? `Official price list on ${a.brand.name} Pakistan` : 'Source: PBS weekly price release'
  return (
    <a
      href={a.officialUrl}
      target="_blank"
      rel="noopener nofollow"
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 font-semibold transition hover:border-accent hover:text-accent', className)}
      data-testid="source"
    >
      {label} <ExternalLink className="h-4 w-4" aria-hidden />
    </a>
  )
}

export function ApplianceCard({ a, priority = false }: { a: ApplianceView; priority?: boolean }) {
  const off = discountText(a)
  return (
    <Link href={applianceHref(a)} className="card-lift group flex h-full flex-col p-4">
      <div className="img-zoom flex h-[150px] items-center justify-center">
        <ApplianceImage a={a} size={140} priority={priority} />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{a.brand.kind === 'source' ? a.category.name : a.brand.name}</p>
      <h3 className="line-clamp-2 font-display text-[1rem] font-bold leading-snug group-hover:text-accent">{a.name}</h3>
      {a.nameUr ? (
        <p className="text-sm text-fg-muted" lang="ur">
          {a.nameUr}
        </p>
      ) : null}
      <p className={cn('mt-auto pt-3 font-display text-lg font-extrabold tabular-nums', !a.pricePkr && 'text-sm font-semibold text-fg-subtle')}>{priceText(a)}</p>
      {a.unit && a.pricePkr ? <p className="text-xs text-fg-subtle">{a.brand.kind === 'source' ? `Average, ${a.unit}` : a.unit}</p> : null}
      {off ? <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{off.split(' (')[0]}</p> : null}
      {a.inStock === false && a.brand.kind === 'store' ? <p className="mt-1 text-xs text-fg-subtle">Out of stock on the brand store</p> : null}
    </Link>
  )
}

export function ApplianceGrid({ items }: { items: ApplianceView[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((a, i) => (
        <ApplianceCard key={a.slug} a={a} priority={i < 4} />
      ))}
    </div>
  )
}

export function CategoryChips({ summaries, active }: { summaries: CategorySummary[]; active?: string }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Categories">
      <Link href={PRICES_HUB} role="listitem" className={cn('chip', !active && 'border-transparent bg-accent text-accent-fg')}>
        All prices
      </Link>
      <Link href="/mobile-prices" role="listitem" className="chip whitespace-nowrap">
        Mobile phones
      </Link>
      {summaries.map((s) => (
        <Link key={s.category.slug} href={categoryHref(s.category.slug)} role="listitem" className={cn('chip whitespace-nowrap', active === s.category.slug && 'border-transparent bg-accent text-accent-fg')}>
          {s.category.name}
        </Link>
      ))}
    </div>
  )
}

// ---------- hub ----------

/** Daily rate pages that belong to the one Prices section */
export const RATE_LINKS = [
  { href: '/petrol-price-today-pakistan', label: 'Petrol & diesel price today', ur: 'پیٹرول' },
  { href: '/gold-rate-today-pakistan', label: 'Gold rate today', ur: 'سونا' },
  { href: '/dollar-rate-today-pakistan', label: 'Dollar rate today', ur: 'ڈالر' },
  { href: '/riyal-dirham-rate-pakistan', label: 'Riyal & dirham rate', ur: 'ریال' },
  { href: '/chicken-price-pakistan', label: 'Chicken price today', ur: 'مرغی' },
  { href: '/prices/cheapest-city', label: 'Cheapest city this week', ur: 'سستا شہر' },
  { href: '/prize-bond-list/rs-1500', label: 'Prize bond list & checker', ur: 'پرائز بانڈ' },
] as const

export interface PhonesSummary {
  count: number
  minPrice: number | null
  brands: string[]
}

function CategoryCards({ summaries }: { summaries: CategorySummary[] }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {summaries.map((s) => (
        <li key={s.category.slug}>
          <Link href={categoryHref(s.category.slug)} className="card-lift flex h-full flex-col p-4">
            <span className="font-display text-lg font-bold">
              {s.category.name} <span className="text-fg-subtle" lang="ur">({s.category.ur})</span>
            </span>
            <span className="mt-1 text-sm text-fg-muted">
              {s.count} {s.category.group === 'groceries' ? 'items' : 'models'}
              {s.category.group === 'groceries' ? ' · 17 cities' : ` · ${s.brands.join(', ')}`}
            </span>
            {s.minPrice ? (
              <span className="mt-2 font-semibold tabular-nums">
                {formatPkr(s.minPrice)}
                {s.maxPrice && s.maxPrice !== s.minPrice ? ` to ${formatPkr(s.maxPrice)}` : ''}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ApplianceHubView({
  summaries,
  movers,
  baskets,
  trending,
  faqs,
  phones,
  basketUpdated,
}: {
  summaries: CategorySummary[]
  movers: { up: Mover[]; down: Mover[]; windowDays: number }
  baskets: CityBasket[]
  trending: ApplianceView[]
  faqs: FAQ[]
  phones: PhonesSummary
  basketUpdated?: string
}) {
  const count = (g: PriceGroupSlug) => summaries.filter((s) => s.category.group === g).reduce((n, s) => n + s.count, 0)
  const groups = PRICE_GROUPS.filter((g) => count(g.slug) > 0)
  const total = summaries.reduce((n, s) => n + s.count, 0)
  const groupSection = (g: (typeof PRICE_GROUPS)[number]) => (
    <section key={g.slug} aria-labelledby={`g-${g.slug}`}>
      <h2 id={`g-${g.slug}`} className="font-display text-xl font-bold">
        {g.name} <span className="text-fg-subtle" lang="ur">({g.ur})</span>
      </h2>
      <CategoryCards summaries={summaries.filter((s) => s.category.group === g.slug)} />
    </section>
  )
  const lo = baskets[0]
  const hi = baskets.at(-1)
  const maxTotal = hi?.total ?? 1
  const basketRows = baskets.length > 9 ? [...baskets.slice(0, 5), ...baskets.slice(-3)] : baskets
  const hasMovers = movers.up.length + movers.down.length > 0
  return (
    <div className="pb-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: 'Prices', url: PRICES_HUB }]), ...(faqs.length ? [faqJsonLd(faqs)] : [])]} />
      <section className="border-b border-border py-8 md:py-12" style={{ background: `color-mix(in oklab, ${COLOR} 8%, var(--bg))` }}>
        <div className="container-wide max-w-[860px]">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-fg-muted">
            <Link href="/" className="hover:text-accent">Home</Link> › <span className="text-fg">Prices</span>
          </nav>
          <h1 className="font-display text-[clamp(2rem,1.4rem+2.4vw,3.2rem)] font-extrabold leading-[1.05]">Prices in Pakistan today: search any price</h1>
          <p className="mt-2 text-fg-muted md:text-lg">
            Atta, eggs, sugar, bikes, cars, fridges, ACs and {total ? `${total.toLocaleString('en-US')} items` : 'hundreds of items'} from official sources, with price history.{' '}
            <span lang="ur">کوئی بھی قیمت تلاش کریں</span>
          </p>
          <PriceSearch className="mt-5" variant="hero" />
        </div>
      </section>
      <div className="container-wide mt-8 space-y-10">
        <CategoryChips summaries={summaries} />

        {hasMovers ? (
          <section aria-labelledby="movers">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="movers" className="font-display text-xl font-bold md:text-2xl">Today&apos;s price movers</h2>
              <p className="text-sm text-fg-muted">Biggest recorded changes in the last {movers.windowDays} days</p>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {([['Going up', movers.up], ['Coming down', movers.down]] as const).map(([title, list]) => (
                <div key={title} className="card-surface min-w-0 p-2 md:p-3">
                  <h3 className="px-3 pb-1 pt-2 text-sm font-bold uppercase tracking-wider text-fg-subtle">{title}</h3>
                  {list.length ? (
                    <ul>
                      {list.map((m) => (
                        <MoverRow key={m.item.slug} href={m.href} name={m.name} sub={m.item.unit} from={m.move.from} to={m.move.to} pct={m.move.pct} when={m.move.t} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 pb-3 text-sm text-fg-muted">No recorded changes in this direction.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {lo && hi ? (
          <section aria-labelledby="basket" className="card-surface p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="basket" className="font-display text-xl font-bold md:text-2xl">Monthly grocery basket by city</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  The same family basket costs {formatPkr(lo.total)} in {lo.city} and {formatPkr(hi.total)} in {hi.city}: {formatPkr(hi.total - lo.total)} a month apart.
                </p>
              </div>
              <Link href="/prices/cheapest-city" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                All {baskets.length} cities <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <ul className="mt-4 space-y-2" aria-label="Basket cost by city, cheapest first">
              {basketRows.map((b, i) => (
                <li key={b.city} className="contents">
                  <div className="grid grid-cols-[84px_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate font-medium">{b.city}</span>
                    <span className="h-3.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.max(8, Math.round((b.total / maxTotal) * 100))}%`, background: b === lo ? 'var(--up)' : b === hi ? 'var(--down)' : 'color-mix(in oklab, var(--accent) 50%, var(--surface-2))' }}
                      />
                    </span>
                    <span className="font-semibold tabular-nums">{formatPkr(b.total)}</span>
                  </div>
                  {baskets.length > 9 && i === 4 ? <p className="py-0.5 text-center text-xs text-fg-subtle">{baskets.length - 8} more cities in between</p> : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-subtle">
              Official PBS weekly prices (city averages){basketUpdated ? `, checked ${dateText(basketUpdated)}` : ''}: 2 bags atta, sugar, ghee, 30 litres milk, eggs, chicken, rice, daal, vegetables, tea and an LPG cylinder.
            </p>
          </section>
        ) : null}

        {trending.length ? (
          <section aria-labelledby="trending">
            <h2 id="trending" className="font-display text-xl font-bold md:text-2xl">Popular prices</h2>
            <p className="mt-1 text-sm text-fg-muted">What people in Pakistan are checking most this week.</p>
            <div className="mt-4">
              <ApplianceGrid items={trending} />
            </div>
          </section>
        ) : null}

        <div className="space-y-8">
          {groups.map(groupSection)}
          <section aria-labelledby="mobiles">
            <h2 id="mobiles" className="font-display text-xl font-bold">
              Mobile phones <span className="text-fg-subtle" lang="ur">(موبائل)</span>
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <li>
                <Link href="/mobile-prices" className="card-lift flex h-full flex-col p-4">
                  <span className="font-display text-lg font-bold">Mobile prices in Pakistan</span>
                  <span className="mt-1 text-sm text-fg-muted">
                    {phones.count} phones · {phones.brands.join(', ')}
                  </span>
                  {phones.minPrice ? <span className="mt-2 font-semibold tabular-nums">From {formatPkr(phones.minPrice)}</span> : null}
                </Link>
              </li>
              <li>
                <Link href="/mobile-prices/new-phones" className="card-lift flex h-full flex-col p-4">
                  <span className="font-display font-bold">New phones</span>
                  <span className="mt-1 text-sm text-fg-muted">Latest launches with official prices</span>
                </Link>
              </li>
              <li>
                <Link href="/mobile-prices/upcoming" className="card-lift flex h-full flex-col p-4">
                  <span className="font-display font-bold">Upcoming phones</span>
                  <span className="mt-1 text-sm text-fg-muted">Announced for Pakistan, coming soon</span>
                </Link>
              </li>
            </ul>
          </section>
        </div>

        <section aria-labelledby="rates">
          <h2 id="rates" className="font-display text-xl font-bold">
            Daily rates
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {RATE_LINKS.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="card-lift flex h-full flex-col p-4">
                  <span className="font-display font-bold">{r.label}</span>
                  <span className="mt-1 text-sm text-fg-subtle" lang="ur">
                    {r.ur}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <ApplianceSourcingNote />
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

// ---------- category and brand lists ----------

export function ApplianceListView({
  title,
  description,
  crumbs,
  items,
  summaries,
  category,
  brands,
  activeBrand,
  faqs,
}: {
  title: string
  description: string
  crumbs: { label: string; href?: string }[]
  items: ApplianceView[]
  summaries: CategorySummary[]
  category: CategorySummary['category']
  brands: { slug: string; name: string; count: number }[]
  activeBrand?: string
  faqs: FAQ[]
}) {
  const priced = items.filter((a) => a.pricePkr)
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, url: c.href ?? (activeBrand ? brandListHref(category.slug, activeBrand) : categoryHref(category.slug)) }))),
          ...(items.length ? [itemListJsonLd(title, items)] : []),
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <PageHero
        title={title}
        description={description}
        icon={Plug}
        color={COLOR}
        eyebrow={category.group === 'groceries' ? 'Weekly official prices' : 'Prices in Pakistan'}
        crumbs={crumbs}
        stats={[{ label: category.group === 'groceries' ? 'Items' : 'Models', value: items.length }]}
      />
      <div className="container-wide mt-8 space-y-6">
        <CategoryChips summaries={summaries} active={category.slug} />
        {brands.length > 1 ? (
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Brands">
            <Link href={categoryHref(category.slug)} role="listitem" className={cn('chip', !activeBrand && 'border-transparent bg-accent text-accent-fg')}>
              All brands
            </Link>
            {brands.map((b) => (
              <Link key={b.slug} href={brandListHref(category.slug, b.slug)} role="listitem" className={cn('chip whitespace-nowrap', activeBrand === b.slug && 'border-transparent bg-accent text-accent-fg')}>
                {b.name} ({b.count})
              </Link>
            ))}
          </div>
        ) : null}
        {priced.length >= 2 ? (
          <section aria-labelledby="table" className="card-surface overflow-x-auto p-4">
            <h2 id="table" className="font-display text-lg font-bold">
              {title}: price list
            </h2>
            <table className="mt-3 w-full min-w-[420px] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-border text-fg-muted">
                  <th className="py-2 text-start">{category.group === 'groceries' ? 'Item' : 'Model'}</th>
                  <th className="py-2 text-start">{category.group === 'groceries' ? 'Average price (PKR)' : 'Price (PKR)'}</th>
                  <th className="py-2 text-start">Updated</th>
                </tr>
              </thead>
              <tbody>
                {priced.slice(0, 40).map((a) => (
                  <tr key={a.slug} className="border-b border-border">
                    <td className="py-2">
                      <Link href={applianceHref(a)} className="underline-offset-2 hover:underline">
                        {fullName(a)}
                      </Link>
                      {a.nameUr ? (
                        <span className="ms-2 text-fg-subtle" lang="ur">
                          {a.nameUr}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 font-semibold tabular-nums">{formatPkr(a.pricePkr!)}</td>
                    <td className="py-2 text-fg-muted">{dateText(a.priceUpdatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        {items.length ? <ApplianceGrid items={items} /> : <p className="rounded-2xl border border-border bg-surface p-6 text-fg-muted">No models listed here yet.</p>}
        <ApplianceSourcingNote group={category.group} />
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

// ---------- product page ----------

/** Lowest, average and highest price per city (PBS weekly survey), cheapest city first */
function CityPricesTable({ a }: { a: ApplianceView }) {
  const rows = [...a.cityPrices].sort((x, y) => x.avg - y.avg)
  const rs = (n: number | null | undefined) => (n ? formatPkr(Math.round(n)) : '—')
  const linked = hasCityPages(a)
  return (
    <section aria-labelledby="cities" className="card-surface overflow-x-auto p-4">
      <h2 id="cities" className="font-display text-xl font-bold">
        {a.name} price in Lahore, Karachi, Islamabad and other cities
      </h2>
      <p className="mt-1 text-sm text-fg-muted">This week&apos;s market prices{a.unit ? ` for ${a.unit}` : ''}, cheapest city first.</p>
      {rows.length >= 3 ? (
        <div className="mt-3">
          <CityBarChart rows={rows} />
        </div>
      ) : null}
      <table className="mt-3 w-full min-w-[420px] border-collapse text-start text-sm">
        <thead>
          <tr className="border-b border-border text-fg-muted">
            <th className="py-2 text-start">City</th>
            <th className="py-2 text-start">Lowest</th>
            <th className="py-2 text-start">Average</th>
            <th className="py-2 text-start">Highest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.city} className="border-b border-border">
              <td className="py-2 font-medium">{linked ? <Link href={cityHref(a, c.city)} className="hover:underline">{c.city}</Link> : c.city}</td>
              <td className="py-2 tabular-nums">{rs(c.min)}</td>
              <td className="py-2 font-semibold tabular-nums">{rs(c.avg)}</td>
              <td className="py-2 tabular-nums">{rs(c.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function AppliancePageView({ a, similar, faqs }: { a: ApplianceView; similar: ApplianceView[]; faqs: FAQ[] }) {
  const full = fullName(a)
  const grocery = a.brand.kind === 'source'
  const maker = a.brand.kind === 'maker'
  const ld = productJsonLd(a)
  const dataset = datasetJsonLd(a)
  const off = discountText(a)
  const bulk = grocery ? bulkPrice(a) : null
  const series = seriesOf(a)
  const week = changeOver(series, 7)
  const month = changeOver(series, 30)
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Prices', href: PRICES_HUB },
    { label: a.category.name, href: categoryHref(a.category.slug) },
    { label: a.name },
  ]
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'Prices', url: PRICES_HUB },
            { name: a.category.name, url: categoryHref(a.category.slug) },
            { name: full, url: applianceHref(a) },
          ]),
          ...(ld ? [ld] : []),
          ...(dataset ? [dataset] : []),
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <section className="border-b border-border py-5 md:py-8" style={{ background: `color-mix(in oklab, ${COLOR} 6%, var(--bg))` }}>
        <div className="container-wide max-w-[960px]">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-fg-muted">
            <ol className="flex flex-wrap items-center gap-1">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden>›</span> : null}
                  {c.href ? (
                    <Link href={c.href} className="hover:text-accent">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-fg">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="eyebrow" style={{ color: COLOR }}>
                {grocery ? `${a.category.name}${a.nameUr ? ` · ${a.nameUr}` : ''}` : `${a.brand.name} ${a.category.singular}`}
              </p>
              <h1 className="mt-1 font-display text-[clamp(1.5rem,1.2rem+1.4vw,2.3rem)] font-extrabold leading-tight">{itemH1(a)}</h1>
            </div>
            {a.imageUrl ? <ApplianceImage a={a} size={96} priority className="shrink-0 md:hidden" /> : null}
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{grocery ? 'Average price in Pakistan this week' : maker ? 'Ex-factory price' : 'Price in Pakistan'}</p>
              <p className="font-display text-[clamp(2.4rem,1.8rem+3vw,3.6rem)] font-extrabold leading-none tabular-nums" data-testid="price">
                {priceText(a)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ChangeBadge change={week} label="this week" />
                <ChangeBadge change={!week || week.abs === 0 ? month : null} label="this month" />
                {a.unit ? <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold">{a.unit}</span> : null}
              </div>
              {a.listPricePkr && off ? <p className="mt-2 text-sm text-fg-muted">Was {formatPkr(a.listPricePkr)}. {off}.</p> : null}
              {bulk ? (
                <p className="mt-2 text-sm" data-testid="bulk-price">
                  <span className="font-semibold">{bulk.kg} kg: about {formatPkr(bulk.pkr)}</span>
                  <span className="text-fg-muted"> at the retail rate per kg × {bulk.kg}; wholesale bags usually cost less</span>
                </p>
              ) : null}
              <p className="mt-2 text-sm text-fg-muted">
                {a.priceUpdatedAt ? `From ${sourceText(a)}. Last checked ${dateText(a.priceUpdatedAt)}.` : 'We update this page when the source shows a price.'}
                {a.inStock === false && a.brand.kind === 'store' ? ' Out of stock right now.' : ''}
              </p>
            </div>
            <div className="flex flex-col gap-2 md:w-[300px]">
              <OfficialLink a={a} className="w-full" />
              <WhatsAppShare a={a} path={applianceHref(a)} className="w-full" />
              <p className="text-xs text-fg-subtle">Opens {hostOf(a.officialUrl)}. Zaviya does not sell anything or earn from this link.</p>
            </div>
          </div>
        </div>
      </section>
      <div className="container-wide mt-6 max-w-[960px] space-y-6">
        <PriceTrendSection a={a} />
        {a.cityPrices.length ? <CityPricesTable a={a} /> : null}
        {a.specs.length ? (
          <section aria-labelledby="specs">
            <h2 id="specs" className="font-display text-xl font-bold">
              {grocery ? `${a.name}: survey details` : `${full} specifications`}
            </h2>
            <dl className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface">
              {a.model ? (
                <div className="grid grid-cols-[40%_1fr] gap-3 p-3 text-sm">
                  <dt className="text-fg-muted">Model</dt>
                  <dd className="font-medium">{a.model}</dd>
                </div>
              ) : null}
              {a.specs.map((s) => (
                <div key={s.label} className="grid grid-cols-[40%_1fr] gap-3 p-3 text-sm">
                  <dt className="text-fg-muted">{s.label}</dt>
                  <dd className="font-medium">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <section aria-labelledby="source" className="card-surface p-4 text-sm md:p-5">
          <h2 id="source" className="font-display text-lg font-bold">
            Source and last check
          </h2>
          <p className="mt-2 text-fg-muted">
            {sourceText(a)}.{a.priceUpdatedAt ? ` We last read this price on ${dateText(a.priceUpdatedAt)}${grocery ? ' (PBS publishes weekly, usually on Fridays)' : ' and check it every day'}.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <OfficialLink a={a} />
          </div>
        </section>
        {similar.length ? (
          <section aria-labelledby="similar">
            <h2 id="similar" className="font-display text-xl font-bold">
              {grocery ? `More ${a.category.name.toLowerCase()} prices` : `Similar ${a.category.name.toLowerCase()} at a similar price`}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {similar.slice(0, 4).map((x) => (
                <li key={x.slug}>
                  <Link href={compareHref(a.slug, x.slug)} className="chip">
                    Compare with {fullName(x)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <ApplianceGrid items={similar} />
            </div>
          </section>
        ) : null}
        <ApplianceSourcingNote group={a.category.group} />
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

// ---------- compare ----------

export function ApplianceCompareView({ a, b }: { a: ApplianceView; b: ApplianceView }) {
  const rows = compareSpecRows(a, b)
  const label = `${fullName(a)} vs ${fullName(b)}`
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Prices', href: PRICES_HUB },
    { label: a.category.name, href: categoryHref(a.category.slug) },
    { label: 'Compare' },
  ]
  return (
    <div className="pb-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: 'Prices', url: PRICES_HUB }, { name: a.category.name, url: categoryHref(a.category.slug) }, { name: label, url: compareHref(a.slug, b.slug) }])]} />
      <PageHero title={label} description={compareVerdict(a, b)} icon={Plug} color={COLOR} eyebrow={`Compare ${a.category.name.toLowerCase()}`} crumbs={crumbs} />
      <div className="container-wide mt-8 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          {[a, b].map((x) => (
            <div key={x.slug} className="card-surface flex flex-col items-center gap-3 p-4 text-center">
              <ApplianceImage a={x} size={140} />
              <Link href={applianceHref(x)} className="font-display font-bold hover:text-accent">
                {fullName(x)}
              </Link>
              <p className="font-display text-xl font-extrabold tabular-nums">{priceText(x)}</p>
              <OfficialLink a={x} className="w-full text-sm" />
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-border text-fg-muted">
                <th className="w-1/3 py-2 text-start"> </th>
                <th className="py-2 text-start">{fullName(a)}</th>
                <th className="py-2 text-start">{fullName(b)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border">
                  <td className="py-2 text-fg-muted">{r.label}</td>
                  <td className="py-2">{r.a}</td>
                  <td className="py-2">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ApplianceSourcingNote group={a.category.group} />
      </div>
    </div>
  )
}
