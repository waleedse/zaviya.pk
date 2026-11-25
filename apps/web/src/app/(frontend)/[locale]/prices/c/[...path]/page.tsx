import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PRODUCTS_INDEX, categoryFromSegments, categoryName, categoryParent, formatPkr, type ProductDoc } from '@zaviya/shared'
import { JsonLd } from '@/components/seo/JsonLd'
import { CategoryBar } from '@/components/prices/HubParts'
import { childrenOf, getCategoryTree } from '@/lib/search/categories'
import { barCategories, catHref } from '@/lib/search/hub-data'
import { discountPct } from '@/lib/search/product-pure'
import { meili, meiliConfigured } from '@/lib/search/meili'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

/** /prices/c/<category>/<sub>/...: one page per category level, cheapest first; the first page of each is indexed, filtered and deep pages are not */
export const revalidate = 300
type Props = { params: Promise<{ locale: string; path: string[] }>; searchParams: Promise<Record<string, string | undefined>> }
const PER = 24
const SORTS: Record<string, { label: string; sort: string[] | undefined }> = {
  cheapest: { label: 'Cheapest first', sort: ['min_price:asc'] },
  popular: { label: 'Most popular', sort: ['popularity:desc'] },
  drop: { label: 'Biggest price drop', sort: ['price_drop_pct:desc', 'popularity:desc'] },
  stores: { label: 'Most stores', sort: ['store_count:desc', 'popularity:desc'] },
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { locale, path } = await params
  const sp = await searchParams
  const cat = categoryFromSegments(path)
  if (!cat) return { title: 'Category not found', robots: { index: false } }
  const tree = await getCategoryTree()
  const row = tree.find((c) => c.path === cat)
  const name = categoryName(cat)
  const filtered = Boolean(sp.sort || sp.page || sp.min || sp.max || sp.store || sp.stock)
  return buildPageMetadata({
    locale: parseLocale(locale),
    title: `${name} prices in Pakistan${row?.minPrice ? `: from ${formatPkr(row.minPrice)}` : ''} | Zaviya`,
    description: `${row ? row.products.toLocaleString('en-US') : 'Hundreds of'} ${name.toLowerCase()} products from Pakistani stores, cheapest first, with every store's price and stock. Compare and save.`,
    enPath: catHref(cat),
    absoluteTitle: true,
    noindex: filtered || !row || row.products < 3,
  })
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { path } = await params
  const sp = await searchParams
  const cat = categoryFromSegments(path)
  if (!cat || !meiliConfigured()) notFound()
  const tree = await getCategoryTree()
  const row = tree.find((c) => c.path === cat)
  if (!row) notFound()
  const sortKey = SORTS[sp.sort ?? ''] ? sp.sort! : 'cheapest'
  const page = Math.max(1, Math.min(40, Number(sp.page) || 1))
  const filter = [`category_path = "${cat.replace(/"/g, '')}"`, ...(sp.stock === '1' ? ['in_stock_any = true'] : []), ...(sp.store ? [`stores = "${sp.store.replace(/["\\]/g, '').slice(0, 60)}"`] : [])]
  const min = Number(sp.min)
  const max = Number(sp.max)
  if (Number.isFinite(min) && min > 0) filter.push(`min_price >= ${Math.floor(min)}`)
  if (Number.isFinite(max) && max > 0) filter.push(`min_price <= ${Math.floor(max)}`)
  type R = { hits: ProductDoc[]; estimatedTotalHits: number; facetDistribution?: Record<string, Record<string, number>> }
  const [r, bar] = await Promise.all([
    meili<R>('POST', `/indexes/${PRODUCTS_INDEX}/search`, { q: '', filter, sort: SORTS[sortKey]!.sort, limit: PER, offset: (page - 1) * PER, facets: ['stores'], attributesToRetrieve: ['id', 'title', 'image', 'offers', 'min_price', 'max_price', 'store_count', 'in_stock_any'] }, 6000).catch(() => ({ hits: [], estimatedTotalHits: 0 }) as R),
    barCategories(tree),
  ])
  const subs = childrenOf(tree, cat)
  const parent = categoryParent(cat)
  const crumbs = cat.split(' > ').map((_, i, a) => a.slice(0, i + 1).join(' > '))
  const stores = Object.entries(r.facetDistribution?.stores ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 12)
  const qs = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) u.set(k, v)
    const s = u.toString()
    return s ? `?${s}` : ''
  }
  const pages = Math.min(40, Math.ceil(r.estimatedTotalHits / PER))
  const pill = (on: boolean) => `inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold ${on ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface'}`
  return (
    <div>
      <CategoryBar cats={bar} />
      <div className="container-wide max-w-[1280px] py-6 md:py-8">
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [{ name: 'Prices', url: '/prices' }, ...crumbs.map((c) => ({ name: categoryName(c), url: catHref(c) }))].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `https://zaviya.pk${c.url}` })),
          }}
        />
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-fg-muted">
          <Link href="/prices" className="hover:text-accent">Prices</Link>
          {crumbs.map((c, i) => (
            <span key={c} className="flex gap-2"><span aria-hidden="true">›</span>{i === crumbs.length - 1 ? <span className="text-fg">{categoryName(c)}</span> : <Link href={catHref(c)} className="hover:text-accent">{categoryName(c)}</Link>}</span>
          ))}
        </nav>
        <h1 className="mt-3 font-display text-[clamp(1.8rem,1.3rem+2vw,2.6rem)] font-extrabold leading-tight">{categoryName(cat)} prices in Pakistan</h1>
        <p className="mt-1 text-fg-muted">{row.products.toLocaleString('en-US')} products from Pakistani stores{row.minPrice ? `, from ${formatPkr(row.minPrice)}` : ''} · cheapest first</p>

        {subs.length ? (
          <section aria-label="Sub-categories" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {subs.map((s) => (
              <Link key={s.path} href={catHref(s.path)} className="card-surface flex items-center gap-3 p-3">
                <span className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-xl bg-white">{s.imageUrl ? <img src={s.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</span>
                <span className="min-w-0"><span className="block truncate font-bold">{s.name}</span><span className="block text-[13px] text-fg-muted">{s.products.toLocaleString('en-US')} products{s.minPrice ? ` · from ${formatPkr(s.minPrice)}` : ''}</span></span>
              </Link>
            ))}
          </section>
        ) : null}

        <div className="mt-6 flex flex-wrap items-start gap-6">
          <aside aria-label="Filters" className="card-surface w-full flex-none p-4 md:w-[260px]">
            <form action="" method="get" className="flex flex-col gap-4">
              {sortKey !== 'cheapest' ? <input type="hidden" name="sort" value={sortKey} /> : null}
              <fieldset className="flex flex-col gap-2"><legend className="text-xs font-bold uppercase tracking-wider text-fg-subtle">Price (Rs)</legend>
                <div className="flex gap-2"><label className="flex-1 text-xs text-fg-muted">Min<input name="min" inputMode="numeric" defaultValue={sp.min ?? ''} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm text-fg" /></label><label className="flex-1 text-xs text-fg-muted">Max<input name="max" inputMode="numeric" defaultValue={sp.max ?? ''} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm text-fg" /></label></div>
              </fieldset>
              <label className="flex min-h-9 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="stock" value="1" defaultChecked={sp.stock === '1'} /> In stock only</label>
              {stores.length ? (
                <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wider text-fg-subtle">Store
                  <select name="store" defaultValue={sp.store ?? ''} className="h-10 rounded-lg border border-border bg-surface px-2 text-sm font-normal normal-case tracking-normal text-fg">
                    <option value="">All stores</option>
                    {stores.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
                  </select>
                </label>
              ) : null}
              <button type="submit" className="h-11 rounded-xl bg-accent font-bold text-accent-fg">Apply</button>
              <Link href={catHref(cat)} className="text-center text-sm text-fg-muted underline">Clear filters</Link>
            </form>
          </aside>
          <section aria-label="Products" className="min-w-0 flex-[999_1_520px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-muted">Sort:</span>
              {Object.entries(SORTS).map(([k, v]) => <Link key={k} href={`${catHref(cat)}${qs({ sort: k === 'cheapest' ? undefined : k, page: undefined })}`} className={pill(sortKey === k)} rel="nofollow">{v.label}</Link>)}
            </div>
            {r.hits.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                {r.hits.map((p) => {
                  const off = Math.max(0, ...p.offers.map(discountPct))
                  const best = [...p.offers].filter((o) => o.in_stock).sort((a, b) => a.price - b.price)[0] ?? p.offers[0]
                  return (
                    <Link key={p.id} href={`/product/${p.id}`} className="card-surface flex flex-col gap-2 p-3">
                      <span className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-white">
                        {p.image ? <img src={p.image} alt={p.title} loading="lazy" className="h-full w-full object-contain" /> : null}
                        {off >= 5 ? <span className="absolute left-2 top-2 rounded-lg bg-breaking px-2 py-1 text-xs font-extrabold text-white">−{off}%</span> : null}
                      </span>
                      <span className="line-clamp-2 min-h-[2.5rem] text-sm leading-snug">{p.title}</span>
                      <span className="text-xl font-extrabold text-accent">{formatPkr(p.min_price)}</span>
                      <span className="text-xs text-fg-muted">{best ? `Best at ${best.store_name} · ` : ''}{p.store_count} store{p.store_count === 1 ? '' : 's'}{p.in_stock_any ? '' : ' · out of stock'}</span>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <p className="card-surface mt-4 p-6 text-fg-muted">No products match these filters. <Link href={catHref(cat)} className="font-semibold text-accent">Clear filters</Link></p>
            )}
            {pages > 1 ? (
              <nav aria-label="Pages" className="mt-6 flex flex-wrap items-center gap-2">
                {page > 1 ? <Link rel="prev nofollow" href={`${catHref(cat)}${qs({ page: page > 2 ? String(page - 1) : undefined })}`} className={pill(false)}>← Previous</Link> : null}
                <span className="text-sm text-fg-muted">Page {page} of {pages}</span>
                {page < pages ? <Link rel="next" href={`${catHref(cat)}${qs({ page: String(page + 1) })}`} className={pill(false)}>Next →</Link> : null}
              </nav>
            ) : null}
          </section>
        </div>
        {parent ? <p className="mt-8 text-sm"><Link href={catHref(parent)} className="font-semibold text-accent">← All {categoryName(parent)}</Link></p> : null}
      </div>
    </div>
  )
}
