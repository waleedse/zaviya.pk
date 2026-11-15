import { ExternalLink, TrendingDown, TrendingUp } from 'lucide-react'
import { formatPkr } from '@zaviya/shared'
import type { OfferView } from '@/lib/offers/queries'

const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' }) : '')

/** "Where to buy": every store that lists this product in its own feed, cheapest first, each with a link to that store */
export function StoreOffersTable({ offers, name }: { offers: OfferView[]; name: string }) {
  if (!offers.length) return null
  const cheapest = offers.find((o) => o.inStock !== false && o.pricePkr)?.pricePkr ?? null
  return (
    <section aria-labelledby="where-to-buy" data-testid="store-offers">
      <h2 id="where-to-buy" className="font-display text-xl font-bold">
        Where to buy {name} in Pakistan
      </h2>
      <p className="mt-1 text-sm text-fg-muted">Prices from each store&apos;s own website, checked through the day. Zaviya does not sell anything or earn from these links.</p>
      <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
        {offers.map((o) => (
          <li key={o.slug} className="flex flex-wrap items-center gap-3 p-3">
            {o.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 rounded-lg bg-white object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{o.storeName}</p>
              <p className="truncate text-xs text-fg-subtle">{o.title}</p>
            </div>
            <div className="text-end">
              <p className="font-display text-lg font-extrabold tabular-nums">
                {o.pricePkr ? formatPkr(o.pricePkr) : '—'}
                {cheapest && o.pricePkr === cheapest && offers.length > 1 && <span className="ms-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">Lowest</span>}
              </p>
              <p className="text-xs text-fg-subtle">{o.inStock === false ? 'Out of stock' : 'In stock'}{o.seenAt ? ` · checked ${dateText(o.seenAt)}` : ''}</p>
            </div>
            <a href={o.url} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold transition hover:border-accent hover:text-accent">
              Visit store <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Store prices that changed this week, with the store's own product image */
export function OfferChangesGrid({ offers }: { offers: OfferView[] }) {
  if (!offers.length) return null
  return (
    <section aria-labelledby="store-changes" className="container-wide mt-12" data-testid="offer-changes">
      <h2 id="store-changes" className="font-display text-2xl font-bold">
        Store prices that changed this week
      </h2>
      <p className="mt-1 text-sm text-fg-muted">Phones, gadgets and appliances whose price moved on Pakistani store websites.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((o) => {
          const down = o.pricePkr! < o.prevPricePkr!
          const Icon = down ? TrendingDown : TrendingUp
          return (
            <li key={o.slug}>
              <a href={o.url} target="_blank" rel="noopener nofollow" className="card-surface flex h-full items-center gap-3 p-3 transition hover:border-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.imageUrl!} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg bg-white object-contain" />
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold">{o.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm tabular-nums">
                    <Icon className={down ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4 text-red-600'} aria-hidden />
                    <span className="font-bold">{formatPkr(o.pricePkr!)}</span>
                    <span className="text-fg-subtle line-through">{formatPkr(o.prevPricePkr!)}</span>
                  </p>
                  <p className="text-xs text-fg-subtle">{o.storeName}</p>
                </div>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
