import Link from 'next/link'
import { ExternalLink, Plug } from 'lucide-react'
import { APPLIANCE_BRANDS, formatPkr, type FAQ } from '@zaviya/shared'
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
  priceText,
  type ApplianceView,
  type CategorySummary,
} from '@/lib/appliances/logic'

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
    itemListElement: items.slice(0, 50).map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: `${a.brand.name} ${a.name}`, url: absoluteUrl(applianceHref(a)) })),
  }
}

function productJsonLd(a: ApplianceView) {
  const url = absoluteUrl(applianceHref(a))
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${a.brand.name} ${a.name}`,
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
            seller: { '@type': 'Organization', name: `${a.brand.name} Pakistan (official store)` },
          },
        }
      : {}),
  }
}

/** Where every number on these pages comes from */
export function ApplianceSourcingNote() {
  return (
    <p className="rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed text-fg-muted">
      Prices are the PKR prices shown on each brand&apos;s own Pakistan store ({APPLIANCE_BRANDS.map((b) => b.name).join(', ')}). We read them every day, keep the price history,
      and link you to the official product page to buy. Dealer and market prices can be higher or lower. Brands that do not publish prices online are not listed yet.
    </p>
  )
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
      alt={`${a.brand.name} ${a.name}`}
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

export function ApplianceCard({ a, priority = false }: { a: ApplianceView; priority?: boolean }) {
  const off = discountText(a)
  return (
    <Link href={applianceHref(a)} className="card-lift group flex h-full flex-col p-4">
      <div className="img-zoom flex h-[150px] items-center justify-center">
        <ApplianceImage a={a} size={140} priority={priority} />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{a.brand.name}</p>
      <h3 className="line-clamp-2 font-display text-[1rem] font-bold leading-snug group-hover:text-accent">{a.name}</h3>
      <p className={cn('mt-auto pt-3 font-display text-lg font-extrabold tabular-nums', !a.pricePkr && 'text-sm font-semibold text-fg-subtle')}>{priceText(a)}</p>
      {off ? <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{off.split(' (')[0]}</p> : null}
      {a.inStock === false ? <p className="mt-1 text-xs text-fg-subtle">Out of stock on the brand store</p> : null}
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
        All appliances
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

export function ApplianceHubView({ summaries, latest, faqs }: { summaries: CategorySummary[]; latest: ApplianceView[]; faqs: FAQ[] }) {
  const total = summaries.reduce((n, s) => n + s.count, 0)
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Prices' }]
  return (
    <div className="pb-10">
      <JsonLd data={[breadcrumbJsonLd([{ name: 'Home', url: '/' }, { name: 'Prices', url: PRICES_HUB }]), ...(faqs.length ? [faqJsonLd(faqs)] : [])]} />
      <PageHero
        title="Home appliance prices in Pakistan"
        description="Official PKR prices of ACs, fridges, washing machines, geysers, heaters, coolers and kitchen appliances, read daily from the brands' own Pakistan stores, with a link to buy."
        icon={Plug}
        color={COLOR}
        eyebrow="Prices"
        crumbs={crumbs}
        stats={[{ label: 'Products listed', value: total }]}
      />
      <div className="container-wide mt-8 space-y-8">
        <CategoryChips summaries={summaries} />
        <section aria-labelledby="cats">
          <h2 id="cats" className="font-display text-xl font-bold">
            Prices by category
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((s) => (
              <li key={s.category.slug}>
                <Link href={categoryHref(s.category.slug)} className="card-lift flex h-full flex-col p-4">
                  <span className="font-display text-lg font-bold">
                    {s.category.name} <span className="text-fg-subtle" lang="ur">({s.category.ur})</span>
                  </span>
                  <span className="mt-1 text-sm text-fg-muted">
                    {s.count} models · {s.brands.join(', ')}
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
        </section>
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
        <p className="text-sm text-fg-muted">
          Looking for phones? See <Link href="/mobile-prices" className="underline">mobile prices in Pakistan</Link>.
        </p>
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
      <PageHero title={title} description={description} icon={Plug} color={COLOR} eyebrow="Prices in Pakistan" crumbs={crumbs} stats={[{ label: 'Models', value: items.length }]} />
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
                  <th className="py-2 text-start">Model</th>
                  <th className="py-2 text-start">Price (PKR)</th>
                  <th className="py-2 text-start">Updated</th>
                </tr>
              </thead>
              <tbody>
                {priced.slice(0, 40).map((a) => (
                  <tr key={a.slug} className="border-b border-border">
                    <td className="py-2">
                      <Link href={applianceHref(a)} className="underline-offset-2 hover:underline">
                        {a.brand.name} {a.name}
                      </Link>
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
        <ApplianceSourcingNote />
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

// ---------- product page ----------

export function AppliancePageView({ a, similar, faqs }: { a: ApplianceView; similar: ApplianceView[]; faqs: FAQ[] }) {
  const full = `${a.brand.name} ${a.name}`
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
          productJsonLd(a),
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <PageHero title={`${full} price in Pakistan`} description={applianceSummary(a)} icon={Plug} color={COLOR} eyebrow={`${a.brand.name} ${a.category.singular}`} crumbs={crumbs} />
      <div className="container-wide mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="card-surface flex items-center justify-center p-6">
            <ApplianceImage a={a} size={240} priority />
          </div>
          <div className="card-surface space-y-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Price in Pakistan</p>
            <p className="font-display text-3xl font-extrabold tabular-nums" data-testid="price">
              {priceText(a)}
            </p>
            {a.listPricePkr && off ? <p className="text-sm text-fg-muted">Was {formatPkr(a.listPricePkr)}. {off}.</p> : null}
            <p className="text-sm text-fg-muted">
              {a.priceUpdatedAt ? `Checked on the official store ${dateText(a.priceUpdatedAt)}` : 'We update this page when the brand shows a price.'}
              {a.inStock === false ? ' · Out of stock right now' : ''}
            </p>
            <BuyButton url={a.officialUrl} brand={a.brand.name} className="w-full" />
            <p className="text-xs text-fg-subtle">Opens {hostOf(a.officialUrl)}. Zaviya does not sell products or earn from this link.</p>
          </div>
        </aside>
        <div className="min-w-0 space-y-8">
          {a.specs.length ? (
            <section aria-labelledby="specs">
              <h2 id="specs" className="font-display text-xl font-bold">
                {full} specifications
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
              <p className="mt-3 text-sm text-fg-muted">No price change recorded yet. We check the official store every day.</p>
            )}
          </section>
          {similar.length ? (
            <section aria-labelledby="similar">
              <h2 id="similar" className="font-display text-xl font-bold">
                Similar {a.category.name.toLowerCase()} at a similar price
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {similar.slice(0, 4).map((x) => (
                  <li key={x.slug}>
                    <Link href={compareHref(a.slug, x.slug)} className="chip">
                      Compare with {x.brand.name} {x.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <ApplianceGrid items={similar} />
              </div>
            </section>
          ) : null}
          <ApplianceSourcingNote />
          <FAQAccordion faqs={faqs} locale="en" />
        </div>
      </div>
    </div>
  )
}

// ---------- compare ----------

export function ApplianceCompareView({ a, b }: { a: ApplianceView; b: ApplianceView }) {
  const rows = compareSpecRows(a, b)
  const label = `${a.brand.name} ${a.name} vs ${b.brand.name} ${b.name}`
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
                {x.brand.name} {x.name}
              </Link>
              <p className="font-display text-xl font-extrabold tabular-nums">{priceText(x)}</p>
              <BuyButton url={x.officialUrl} brand={x.brand.name} className="w-full text-sm" />
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-start text-sm">
            <thead>
              <tr className="border-b border-border text-fg-muted">
                <th className="w-1/3 py-2 text-start"> </th>
                <th className="py-2 text-start">{a.brand.name} {a.name}</th>
                <th className="py-2 text-start">{b.brand.name} {b.name}</th>
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
        <ApplianceSourcingNote />
      </div>
    </div>
  )
}
