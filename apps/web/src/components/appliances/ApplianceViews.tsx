import Link from 'next/link'
import { ExternalLink, Plug } from 'lucide-react'
import { PRICE_GROUPS, formatPkr, type FAQ, type PriceGroupSlug } from '@zaviya/shared'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { PageHero } from '@/components/layout/PageHero'
import { JsonLd } from '@/components/seo/JsonLd'
import { hostOf } from '@/components/phones/PhoneParts'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import { cn } from '@/lib/utils'
import {
  applianceSummary,
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
  latest,
  trending,
  faqs,
  phones,
}: {
  summaries: CategorySummary[]
  latest: ApplianceView[]
  trending: ApplianceView[]
  faqs: FAQ[]
  phones: PhonesSummary
}) {
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Prices' }]
  const count = (g: PriceGroupSlug) => summaries.filter((s) => s.category.group === g).reduce((n, s) => n + s.count, 0)
  const groups = PRICE_GROUPS.filter((g) => count(g.slug) > 0)
  const appliances = groups.find((g) => g.slug === 'appliances')
  const others = groups.filter((g) => g.slug !== 'appliances')
  const groupSection = (g: (typeof PRICE_GROUPS)[number]) => (
    <section key={g.slug} aria-labelledby={`g-${g.slug}`}>
      <h2 id={`g-${g.slug}`} className="font-display text-xl font-bold">
        {g.name} <span className="text-fg-subtle" lang="ur">({g.ur})</span>
      </h2>
      <CategoryCards summaries={summaries.filter((s) => s.category.group === g.slug)} />
    </section>
  )
  return (
    <div className="pb-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: 'Prices', url: PRICES_HUB }]), ...(faqs.length ? [faqJsonLd(faqs)] : [])]} />
      <PageHero
        title="Prices in Pakistan today"
        description="One place for official prices: atta, sugar, ghee, milk, eggs and LPG in 17 cities, Honda bikes and Toyota and Hyundai cars, mobile phones, home appliances from the brands' own stores, and today's petrol, gold, dollar and chicken rates."
        icon={Plug}
        color={COLOR}
        eyebrow="Prices"
        crumbs={crumbs}
        stats={[
          { label: 'Groceries', value: count('groceries') },
          { label: 'Bikes & cars', value: count('vehicles') },
          { label: 'Phones', value: phones.count },
          { label: 'Appliances', value: count('appliances') },
        ]}
      />
      <div className="container-wide mt-8 space-y-8">
        <CategoryChips summaries={summaries} />
        <section aria-labelledby="rates">
          <h2 id="rates" className="font-display text-xl font-bold">
            Daily rates
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        {trending.length ? (
          <section aria-labelledby="trending">
            <h2 id="trending" className="font-display text-xl font-bold">
              Trending prices
            </h2>
            <p className="mt-1 text-sm text-fg-muted">What people in Pakistan are checking most this week.</p>
            <div className="mt-4">
              <ApplianceGrid items={trending} />
            </div>
          </section>
        ) : null}
        {others.map(groupSection)}
        <section aria-labelledby="mobiles">
          <h2 id="mobiles" className="font-display text-xl font-bold">
            Mobile phones
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <li className="sm:col-span-2">
              <Link href="/mobile-prices" className="card-lift flex h-full flex-col p-4">
                <span className="font-display text-lg font-bold">
                  Mobile prices in Pakistan <span className="text-fg-subtle" lang="ur">(موبائل)</span>
                </span>
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
        {appliances ? groupSection(appliances) : null}
        {latest.length ? (
          <section aria-labelledby="latest">
            <h2 id="latest" className="font-display text-xl font-bold">
              Price changes this week
            </h2>
            <div className="mt-4">
              <ApplianceGrid items={latest} />
            </div>
          </section>
        ) : null}
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
  const off = discountText(a)
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
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <PageHero
        title={itemH1(a)}
        description={applianceSummary(a)}
        icon={Plug}
        color={COLOR}
        eyebrow={grocery ? `${a.category.name}${a.nameUr ? ` · ${a.nameUr}` : ''}` : `${a.brand.name} ${a.category.singular}`}
        crumbs={crumbs}
      />
      <div className="container-wide mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="card-surface flex items-center justify-center p-6">
            <ApplianceImage a={a} size={240} priority />
          </div>
          <div className="card-surface space-y-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {grocery ? 'Average price in Pakistan this week' : maker ? 'Ex-factory price' : 'Price in Pakistan'}
            </p>
            <p className="font-display text-3xl font-extrabold tabular-nums" data-testid="price">
              {priceText(a)}
            </p>
            {a.listPricePkr && off ? <p className="text-sm text-fg-muted">Was {formatPkr(a.listPricePkr)}. {off}.</p> : null}
            {a.unit ? <p className="text-sm font-medium">{a.unit}</p> : null}
            <p className="text-sm text-fg-muted">
              {a.priceUpdatedAt ? `From ${sourceText(a)}, checked ${dateText(a.priceUpdatedAt)}` : 'We update this page when the source shows a price.'}
              {a.inStock === false && a.brand.kind === 'store' ? ' · Out of stock right now' : ''}
            </p>
            <OfficialLink a={a} className="w-full" />
            <p className="text-xs text-fg-subtle">Opens {hostOf(a.officialUrl)}. Zaviya does not sell anything or earn from this link.</p>
          </div>
        </aside>
        <div className="min-w-0 space-y-8">
          {a.cityPrices.length ? <CityPricesTable a={a} /> : null}
          {a.specs.length ? (
            <section aria-labelledby="specs">
              <h2 id="specs" className="font-display text-xl font-bold">
                {grocery ? `${a.name}: survey details` : `${full} specifications`}
              </h2>
              <dl className="mt-3 divide-y divide-border rounded-2xl border border-border">
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
          <section aria-labelledby="history">
            <h2 id="history" className="font-display text-xl font-bold">
              Price history
            </h2>
            {a.priceHistory.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {a.priceHistory.slice(0, 15).map((r, i) => (
                  <li key={`${r.date}-${i}`} className="flex justify-between border-b border-border py-1.5">
                    <span>{dateText(r.date)}</span>
                    <span className="font-semibold tabular-nums">{formatPkr(r.pricePkr)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-fg-muted">No price change recorded yet. We check the source {grocery ? 'every week' : 'every day'}.</p>
            )}
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
