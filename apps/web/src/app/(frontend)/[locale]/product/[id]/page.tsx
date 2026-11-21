import { notFound } from 'next/navigation'
import { PRODUCTS_INDEX, formatPkr, type ProductDoc } from '@zaviya/shared'
import { NearestStore } from '@/components/products/NearestStore'
import { meili, meiliConfigured } from '@/lib/search/meili'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { PriceChart } from '@/components/products/PriceChart'
import { priceHistory } from '@/lib/search/history'

/** /product/<id>: one product, every store that sells it, each price, the best price (docs/PRODUCT-SEARCH.md section 5) */
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

export async function generateMetadata({ params }: Props) {
  const { locale, id } = await params
  const p = await load(id)
  if (!p) return { title: 'Product not found', robots: { index: false } }
  return buildPageMetadata({
    locale: parseLocale(locale),
    title: `${p.title} price in Pakistan: from ${formatPkr(p.min_price)} | Zaviya`,
    description: `${p.title} at ${p.store_count} store${p.store_count === 1 ? '' : 's'}: ${p.offers.slice(0, 3).map((o) => `${o.store_name} ${formatPkr(o.price)}`).join(', ')}. Compare and buy from the store directly.`,
    enPath: `/product/${id}`,
    absoluteTitle: true,
    noindex: p.store_count < 2 && !p.match_slug,
  })
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params
  const p = await load(id)
  if (!p) notFound()
  const best = p.offers.find((o) => o.in_stock) ?? p.offers[0]!
  const history = await priceHistory(p.offers.map((o) => o.slug).filter((x): x is string => Boolean(x)))
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.title,
          ...(p.image ? { image: p.image } : {}),
          ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
          offers: { '@type': 'AggregateOffer', priceCurrency: 'PKR', lowPrice: p.min_price, highPrice: p.max_price, offerCount: p.offers.length },
        }}
      />
      <div className="flex gap-4">
        {p.image ? <img src={p.image} alt={p.title} className="h-40 w-40 flex-none rounded object-contain" /> : null}
        <div>
          <h1 className="text-2xl font-bold">{p.title}</h1>
          {p.brand ? <p className="text-neutral-600">{p.brand}</p> : null}
          <p className="mt-2 text-3xl font-bold text-teal-700">{formatPkr(best.price)}</p>
          <p className="text-sm text-neutral-600">Best price at {best.store_name}{p.store_count > 1 ? `, ${p.store_count} stores compared` : ''}</p>
          {p.image_store ? <p className="mt-1 text-xs text-neutral-400">Picture from the {p.image_store} listing</p> : null}
        </div>
      </div>
      <h2 className="mt-6 text-lg font-semibold">Where to buy</h2>
      <ul className="mt-2 divide-y rounded border">
        {p.offers.map((o) => (
          <li key={o.store + o.url} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <span className="font-medium">{o.store_name}</span>
              {o === best ? <span className="ml-2 rounded bg-teal-100 px-2 py-0.5 text-xs text-teal-800">Best price</span> : null}
              {!o.in_stock ? <span className="ml-2 text-xs text-red-600">Out of stock</span> : null}
              <div className="text-xs text-neutral-500">Updated {new Date(o.updated_at * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' })}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-bold">{formatPkr(o.price)}</div>
                {o.list_price ? <div className="text-xs text-neutral-500 line-through">{formatPkr(o.list_price)}</div> : null}
              </div>
              <a href={o.url} target="_blank" rel="noopener nofollow" className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white">Buy at {o.store_name}</a>
            </div>
          </li>
        ))}
      </ul>
      <PriceChart points={history} />
      <NearestStore branches={[]} />
    </div>
  )
}
