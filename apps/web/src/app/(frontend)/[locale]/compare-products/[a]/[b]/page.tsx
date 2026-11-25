import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { PRODUCTS_INDEX, formatPkr, type ProductDoc } from '@zaviya/shared'
import { JsonLd } from '@/components/seo/JsonLd'
import { meili, meiliConfigured } from '@/lib/search/meili'
import { buyingPick, compareHref, discountPct, productHref } from '@/lib/search/product-view'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

/** /compare-products/<idA>/<idB>: any two products side by side. The pair is indexed in one order only (A < B); the other order redirects. */
export const revalidate = 300
type Props = { params: Promise<{ locale: string; a: string; b: string }> }

const ID = /^[A-Za-z0-9_-]{1,480}$/
async function load(id: string): Promise<ProductDoc | null> {
  if (!meiliConfigured() || !ID.test(id)) return null
  try {
    return await meili<ProductDoc>('GET', `/indexes/${PRODUCTS_INDEX}/documents/${encodeURIComponent(id)}`)
  } catch {
    return null
  }
}

const shortTitle = (t: string) => (t.length > 60 ? `${t.slice(0, 57).replace(/\s+\S*$/, '')}…` : t)

export async function generateMetadata({ params }: Props) {
  const { locale, a, b } = await params
  const [x, y] = await Promise.all([load(a), load(b)])
  if (!x || !y || a === b) return { title: 'Not found', robots: { index: false } }
  return buildPageMetadata({
    locale: parseLocale(locale),
    title: `${shortTitle(x.title)} vs ${shortTitle(y.title)}: price in Pakistan compared | Zaviya`,
    description: `${shortTitle(x.title)} from ${formatPkr(x.min_price)} at ${x.store_count} store${x.store_count === 1 ? '' : 's'}, ${shortTitle(y.title)} from ${formatPkr(y.min_price)} at ${y.store_count}. Prices, stock and specs side by side.`,
    enPath: compareHref(a, b),
    absoluteTitle: true,
    noindex: a > b || (x.store_count < 2 && !x.match_slug) || (y.store_count < 2 && !y.match_slug),
  })
}

function verdict(x: ProductDoc, y: ProductDoc): string {
  const px = buyingPick(x)!
  const py = buyingPick(y)!
  const [lo, hi, loP, hiP] = px.best.price <= py.best.price ? [x, y, px, py] : [y, x, py, px]
  const diff = hiP.best.price - loP.best.price
  const stock = loP.best.in_stock && hiP.best.in_stock ? 'both in stock' : !loP.best.in_stock ? `${shortTitle(lo.title)} is out of stock at its cheapest store` : `${shortTitle(hi.title)} is out of stock at its cheapest store`
  if (diff === 0) return `Both start at ${formatPkr(loP.best.price)}; ${stock}. Choose on features, warranty and which store you trust.`
  return `${shortTitle(lo.title)} costs ${formatPkr(diff)} less (${formatPkr(loP.best.price)} against ${formatPkr(hiP.best.price)}; ${stock}). The dearer one may still suit you better: compare the specs below and check each store's warranty.`
}

export default async function ComparePage({ params }: Props) {
  const { a, b } = await params
  if (a === b) notFound()
  if (a > b) permanentRedirect(compareHref(a, b))
  const [x, y] = await Promise.all([load(a), load(b)])
  if (!x || !y) notFound()
  const cols = [x, y]
  const picks = cols.map((p) => buyingPick(p)!)
  const lowest = Math.min(...picks.map((p) => p.best.price))
  const specKeys = [...new Set(cols.flatMap((p) => Object.keys(p.specs ?? {})))].slice(0, 20)
  const rows: [string, (p: ProductDoc, i: number) => React.ReactNode][] = [
    ['Stores selling it', (p) => `${p.store_count} (in stock at ${p.offers.filter((o) => o.in_stock).length})`],
    ['Price range', (p) => (p.min_price === p.max_price ? formatPkr(p.min_price) : `${formatPkr(p.min_price)} to ${formatPkr(p.max_price)}`)],
    ['Biggest discount', (p) => { const d = Math.max(0, ...p.offers.map(discountPct)); return d >= 3 ? `${d}% off list price` : 'None shown' }],
    ['Brand', (p) => p.brand ?? '—'],
    ...specKeys.map((k): [string, (p: ProductDoc, i: number) => React.ReactNode] => [k, (p) => p.specs?.[k] ?? '—']),
  ]
  return (
    <div className="container-wide max-w-[1100px] py-6 md:py-10">
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'ItemList', name: `${x.title} vs ${y.title}`, itemListElement: cols.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `https://zaviya.pk${productHref(p.id)}`, name: p.title })) }} />
      <nav aria-label="Breadcrumb" className="text-sm text-fg-muted"><Link href="/prices" className="hover:text-accent">Prices</Link> › <span className="text-fg">Compare</span></nav>
      <h1 className="mt-3 font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.3rem)] font-extrabold leading-tight">{shortTitle(x.title)} vs {shortTitle(y.title)}: price in Pakistan compared</h1>

      <div className="mt-5 rounded-2xl border border-amber/40 bg-amber-soft p-5">
        <div className="font-display text-lg font-extrabold"><span aria-hidden="true">✦</span> Zaviya AI verdict</div>
        <p className="mt-2 text-[15px] leading-relaxed">{verdict(x, y)}</p>
        <p className="mt-2 text-[13px] text-fg-muted">Written from today's store prices. It can be wrong: check the store before you buy.</p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className="w-[180px] p-4" />
              {cols.map((p, i) => (
                <th key={p.id} scope="col" className={`border-l border-border p-4 align-top ${picks[i]!.best.price === lowest ? 'bg-accent-soft' : ''}`}>
                  <Link href={productHref(p.id)} className="flex flex-col gap-2 font-normal">
                    <span className="flex h-40 items-center justify-center overflow-hidden rounded-xl bg-white">{p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-contain" /> : null}</span>
                    <span className="text-base font-bold text-fg">{p.title}</span>
                  </Link>
                  <div className="mt-1 text-2xl font-extrabold text-accent">{formatPkr(picks[i]!.best.price)}{picks[i]!.best.price === lowest && picks[0]!.best.price !== picks[1]!.best.price ? <span className="ml-2 rounded-md bg-accent px-2 py-0.5 align-middle text-xs font-bold text-accent-fg">Cheaper</span> : null}</div>
                  <a href={picks[i]!.best.url} target="_blank" rel="noopener nofollow sponsored" className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-accent font-bold text-accent-fg">{picks[i]!.best.in_stock ? 'Buy' : 'Check'} at {picks[i]!.best.store_name} ↗</a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label} className="border-t border-border">
                <th scope="row" className="p-4 text-sm font-normal text-fg-muted">{label}</th>
                {cols.map((p, i) => <td key={p.id} className="border-l border-border p-4 text-[15px]">{cell(p, i)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-fg-subtle">Specs are copied from the stores' listings; "—" means the stores do not list it. Prices are each store's own.</p>
    </div>
  )
}
