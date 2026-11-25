import Link from 'next/link'
import { formatPkr } from '@zaviya/shared'
import { CategoryBar } from '@/components/prices/HubParts'
import { getCategoryTree } from '@/lib/search/categories'
import { barCategories } from '@/lib/search/hub-data'
import { PRICE_BANDS, onSale } from '@/lib/search/hub'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

/** /prices/on-sale: every product with a real cut against the store's own list price, biggest cut first */
export const revalidate = 600

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return buildPageMetadata({
    locale: parseLocale((await params).locale),
    title: 'Best Offers and Discounts in Pakistan Today | Zaviya',
    description: 'Real discounts from Pakistani stores today: products priced below the store’s own crossed-out price, in stock, biggest cut first. Compare every store.',
    enPath: '/prices/on-sale',
    absoluteTitle: true,
  })
}

export default async function OnSalePage({ searchParams }: { searchParams: Promise<{ band?: string }> }) {
  const { band } = await searchParams
  const b = PRICE_BANDS.find((x) => x.key === band)
  const [all, tree] = await Promise.all([onSale(160), getCategoryTree()])
  const bar = await barCategories(tree)
  const deals = b ? all.filter((d) => d.price >= b.min && d.price <= b.max) : all
  return (
    <div>
      <CategoryBar cats={bar} />
      <div className="container-wide max-w-[1280px] py-6 md:py-8">
        <nav aria-label="Breadcrumb" className="text-sm text-fg-muted"><Link href="/prices" className="hover:text-accent">Prices</Link> › <span className="text-fg">On sale</span></nav>
        <h1 className="mt-3 font-display text-[clamp(1.8rem,1.3rem+2vw,2.6rem)] font-extrabold leading-tight">Best offers in Pakistan today</h1>
        <p className="mt-1 text-fg-muted">Real cuts against each store's own crossed-out price, in stock now. Biggest cut first.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/prices/on-sale" className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold ${!b ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface'}`}>All prices</Link>
          {PRICE_BANDS.map((x) => <Link key={x.key} href={`/prices/on-sale?band=${x.key}`} rel="nofollow" className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold ${b?.key === x.key ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface'}`}>{x.label}</Link>)}
        </div>
        {deals.length ? (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            {deals.map((d) => (
              <Link key={d.id} href={`/product/${d.id}`} className="card-surface flex flex-col gap-2 p-3">
                <span className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl bg-white">
                  {d.image ? <img src={d.image} alt={d.title} loading="lazy" className="h-full w-full object-contain" /> : null}
                  <span className="absolute left-2 top-2 rounded-lg bg-breaking px-2 py-1 text-[13px] font-extrabold text-white">−{d.offPct}%</span>
                </span>
                <span className="line-clamp-2 min-h-[2.5rem] text-sm leading-snug">{d.title}</span>
                <span className="flex flex-wrap items-baseline gap-2"><span className="text-xl font-extrabold text-accent">{formatPkr(d.price)}</span>{d.listPrice ? <s className="text-xs text-fg-subtle">{formatPkr(d.listPrice)}</s> : null}</span>
                <span className="text-xs text-fg-muted">{d.store} · {d.stores} stores</span>
              </Link>
            ))}
          </div>
        ) : <p className="card-surface mt-5 p-6 text-fg-muted">No real discounts in this range right now.</p>}
      </div>
    </div>
  )
}
