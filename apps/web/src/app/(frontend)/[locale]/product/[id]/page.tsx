import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@payloadcms/db-postgres'
import { PRODUCTS_INDEX, categoryName, categoryUrlPath, formatPkr, type ProductDoc } from '@zaviya/shared'
import { NearestStore } from '@/components/products/NearestStore'
import { CompareBox, Gallery, HistoryChart, OffersTable } from '@/components/products/ProductParts'
import { meili, meiliConfigured } from '@/lib/search/meili'
import { buyingPick, clip, compareHref, discountPct, productHref, similarProducts } from '@/lib/search/product-view'
import { getPayloadClient } from '@/lib/payload'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { priceHistory } from '@/lib/search/history'

/** /product/<id>: one product, every store that sells it cheapest first, pictures, specs, a buying pick, price history, compare and similar (docs/PRODUCT-SEARCH.md section 5) */
export const revalidate = 120
type Props = { params: Promise<{ locale: string; id: string }> }

async function load(id: string): Promise<ProductDoc | null> {
  if (!meiliConfigured() || !/^[A-Za-z0-9_-]{1,480}$/.test(id)) return null
  try {
    return await meili<ProductDoc>('GET', `/indexes/${PRODUCTS_INDEX}/documents/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

async function aiNote(id: string): Promise<string | null> {
  try {
    const payload = await getPayloadClient()
    const r = (await payload.db.drizzle.execute(sql`SELECT note FROM product_ai_notes WHERE product_id = ${id} AND created_at > now() - interval '14 days'`)) as unknown as { rows?: { note: string }[] }
    return r.rows?.[0]?.note ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params
  const p = await load(id)
  if (!p) return { title: 'Product not found', robots: { index: false } }
  const best = [...p.offers].sort((a, b) => Number(b.in_stock) - Number(a.in_stock) || a.price - b.price)[0]!
  return buildPageMetadata({
    locale: parseLocale(locale),
    title: `${p.title} price in Pakistan: from ${formatPkr(p.min_price)} | Zaviya`,
    description: `${p.title} at ${p.store_count} store${p.store_count === 1 ? '' : 's'}: ${p.offers.slice(0, 3).map((o) => `${o.store_name} ${formatPkr(o.price)}`).join(', ')}. ${best.in_stock ? 'In stock' : 'Out of stock'} at ${best.store_name}. Compare prices, pictures and specs.`,
    enPath: `/product/${id}`,
    absoluteTitle: true,
    noindex: p.store_count < 2 && !p.match_slug,
  })
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params
  const p = await load(id)
  if (!p) notFound()
  const [history, similar, note] = await Promise.all([priceHistory(p.offers.map((o) => o.slug).filter((x): x is string => Boolean(x))), similarProducts(p, 8), aiNote(id)])
  const pick = buyingPick(p)!
  const best = pick.best
  const images = p.images?.length ? p.images : p.image ? [{ url: p.image, store: p.image_store ?? 'a store' }] : []
  const specs = Object.entries(p.specs ?? {})
  const crumbs = p.category_path.filter((c) => c !== 'Other')
  const inStockCount = p.offers.filter((o) => o.in_stock).length
  const off = discountPct(best)
  const sameCategory = similar.slice(0, 4)
  return (
    <div className="container-wide max-w-[1280px] py-5 md:py-8">
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: p.title,
            ...(images.length ? { image: images.map((i) => i.url) } : {}),
            ...(p.description ? { description: clip(p.description, 500) } : {}),
            ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
            offers: {
              '@type': 'AggregateOffer',
              priceCurrency: 'PKR',
              lowPrice: p.min_price,
              highPrice: p.max_price,
              offerCount: p.offers.length,
              offers: p.offers.slice(0, 10).map((o) => ({ '@type': 'Offer', price: o.price, priceCurrency: 'PKR', url: o.url, availability: o.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@type': 'Organization', name: o.store_name } })),
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [{ name: 'Prices', url: '/prices' }, ...crumbs.map((c) => ({ name: categoryName(c), url: `/prices/c/${categoryUrlPath(c)}` })), { name: p.title, url: productHref(id) }].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `https://zaviya.pk${c.url}` })),
          },
        ]}
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-fg-muted">
        <Link href="/prices" className="hover:text-accent">Prices</Link>
        {crumbs.map((c) => (
          <span key={c} className="flex gap-2"><span aria-hidden="true">›</span><Link href={`/prices/c/${categoryUrlPath(c)}`} className="hover:text-accent">{categoryName(c)}</Link></span>
        ))}
      </nav>

      <section className="mt-5 flex flex-wrap gap-8 lg:flex-nowrap">
        <div className="w-full min-w-0 lg:w-[46%]"><Gallery images={images} title={p.title} /></div>
        <div className="flex w-full min-w-0 flex-col gap-4 lg:w-[54%]">
          <div className="flex flex-col gap-2">
            {p.brand ? <span className="text-sm font-semibold text-fg-muted">{p.brand}</span> : null}
            <h1 className="font-display text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] font-extrabold leading-tight">{p.title} price in Pakistan</h1>
            <div className="flex flex-wrap gap-2 text-[13px] font-semibold">
              <span className="rounded-full bg-accent-soft px-3 py-1 text-accent">{p.store_count} store{p.store_count === 1 ? '' : 's'} compared</span>
              <span className={`rounded-full px-3 py-1 ${inStockCount ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-down'}`}>{inStockCount ? `In stock at ${inStockCount}` : 'Out of stock everywhere'}</span>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-accent bg-surface p-5">
            <span className="text-[13px] font-bold uppercase tracking-wider text-accent">{best.in_stock ? 'Best price in stock' : 'Cheapest listed price'}</span>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-[clamp(2rem,1.6rem+1.6vw,2.7rem)] font-extrabold tracking-tight">{formatPkr(best.price)}</span>
              {best.list_price ? <s className="text-base text-fg-subtle">{formatPkr(best.list_price)}</s> : null}
              {off >= 3 ? <span className="rounded-lg bg-amber-soft px-2.5 py-1 text-sm font-bold text-amber">Save {formatPkr(best.list_price! - best.price)} ({off}%)</span> : null}
            </div>
            <p className="mt-1 text-[15px] text-fg-muted">at <strong className="text-fg">{best.store_name}</strong>{p.store_count > 1 ? ` · across stores ${formatPkr(p.min_price)} to ${formatPkr(p.max_price)}` : ''}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={best.url} target="_blank" rel="noopener nofollow sponsored" className="inline-flex h-12 items-center rounded-xl bg-accent px-6 font-bold text-accent-fg">Buy at {best.store_name} ↗</a>
              <a href="#compare" className="inline-flex h-12 items-center rounded-xl border border-border bg-surface px-5 font-semibold">Compare with…</a>
            </div>
          </div>

          <div className="rounded-2xl border border-amber/40 bg-amber-soft p-5">
            <div className="flex items-center gap-2 font-display text-lg font-extrabold"><span aria-hidden="true">✦</span> Zaviya AI pick</div>
            <p className="mt-2 text-[15px] leading-relaxed"><strong>{pick.headline}.</strong> {pick.points.join(' ')}</p>
            {note ? <p className="mt-2 text-[15px] leading-relaxed">{note}</p> : null}
            <p className="mt-2 text-[13px] leading-snug text-fg-muted">This summary is written by AI from the store prices above. It can be wrong: check the price, warranty (official or not) and seller on the store's own page before you pay.</p>
          </div>
        </div>
      </section>

      <div className="mt-8 space-y-8">
        <OffersTable offers={p.offers} />

        <section className="flex flex-wrap gap-6 lg:flex-nowrap">
          <div className="card-surface w-full min-w-0 p-4 md:p-6 lg:w-1/2">
            <h2 className="font-display text-xl font-bold">Specifications</h2>
            {specs.length ? (
              <dl className="mt-3">
                {specs.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[150px_1fr] gap-4 border-b border-border py-3 text-[15px] last:border-0"><dt className="text-fg-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
              </dl>
            ) : (
              <dl className="mt-3 text-[15px]">
                {p.brand ? <div className="grid grid-cols-[150px_1fr] gap-4 border-b border-border py-3"><dt className="text-fg-muted">Brand</dt><dd className="font-medium">{p.brand}</dd></div> : null}
                {p.model ? <div className="grid grid-cols-[150px_1fr] gap-4 border-b border-border py-3"><dt className="text-fg-muted">Model</dt><dd className="font-medium">{p.model}</dd></div> : null}
                <div className="grid grid-cols-[150px_1fr] gap-4 py-3"><dt className="text-fg-muted">Category</dt><dd className="font-medium">{crumbs.map(categoryName).join(' › ') || 'Other'}</dd></div>
              </dl>
            )}
            {p.description ? <div className="mt-4"><h3 className="text-sm font-bold uppercase tracking-wider text-fg-subtle">From the store listing</h3><p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-fg-muted">{clip(p.description, 900)}</p></div> : null}
            <p className="mt-3 text-xs text-fg-subtle">Specs and text are copied from the stores' own listings; warranty and what is in the box can differ by store.</p>
          </div>
          <div className="w-full min-w-0 lg:w-1/2">
            <HistoryChart points={history} />
          </div>
        </section>

        <div id="compare" className="scroll-mt-24">
          <CompareBox id={id} title={p.title} suggestions={sameCategory.map((s) => ({ id: s.id, title: s.title, image: s.image, min_price: s.min_price, store_count: s.store_count }))} />
        </div>

        {similar.length ? (
          <section aria-labelledby="sim-h">
            <h2 id="sim-h" className="font-display text-xl font-bold md:text-2xl">Similar products</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {similar.map((s) => (
                <div key={s.id} className="card-surface flex flex-col gap-2 p-3">
                  <Link href={productHref(s.id)} className="flex flex-col gap-2">
                    <span className="flex h-32 items-center justify-center overflow-hidden rounded-xl bg-white">{s.image ? <img src={s.image} alt={s.title} loading="lazy" className="h-full w-full object-contain" /> : null}</span>
                    <span className="line-clamp-2 min-h-[2.5rem] text-sm">{s.title}</span>
                    <span className="text-lg font-extrabold text-accent">{formatPkr(s.min_price)}</span>
                    <span className="text-xs text-fg-muted">{s.store_count} store{s.store_count === 1 ? '' : 's'}</span>
                  </Link>
                  <Link href={compareHref(id, s.id)} className="mt-auto border-t border-border pt-2 text-[13px] font-semibold text-accent">Compare with this →</Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <NearestStore branches={[]} />
      </div>
    </div>
  )
}
