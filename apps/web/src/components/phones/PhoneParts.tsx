import Link from 'next/link'
import { Smartphone } from 'lucide-react'
import { PRICE_BANDS } from '@zaviya/shared'
import { cn } from '@/lib/utils'
import { bandLabel, bandSlug, fromPriceText, NOT_ANNOUNCED, priceText } from '@/lib/phones/logic'
import type { BrandView, PhoneView, PriceHistoryRow } from '@/lib/phones/types'

export const phoneHref = (slug: string) => `/mobile/${slug}`

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Official product photo; a plain tile when we have none. Remote press images are not run through the optimiser. */
export function PhoneImage({ phone, size = 160, priority = false, className }: { phone: Pick<PhoneView, 'imageUrl' | 'name' | 'brand'>; size?: number; priority?: boolean; className?: string }) {
  if (!phone.imageUrl)
    return (
      <span className={cn('flex items-center justify-center rounded-xl bg-surface-2 text-fg-subtle', className)} style={{ width: size, height: size }} aria-hidden>
        <Smartphone className="h-1/3 w-1/3" />
      </span>
    )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={phone.imageUrl}
      alt={`${phone.brand.name} ${phone.name}`}
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

export function PhoneCard({ phone, priority = false }: { phone: PhoneView; priority?: boolean }) {
  const priced = phone.pricePkr != null
  return (
    <Link href={phoneHref(phone.slug)} className="card-lift group flex h-full flex-col p-4">
      <div className="img-zoom flex h-[150px] items-center justify-center">
        <PhoneImage phone={phone} size={140} priority={priority} />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{phone.brand.name}</p>
      <h3 className="font-display text-[1.05rem] font-bold leading-snug group-hover:text-accent">{phone.name}</h3>
      <p className={cn('mt-auto pt-3 font-display text-lg font-extrabold tabular-nums', !priced && 'text-base font-semibold text-fg-subtle')}>{fromPriceText(phone)}</p>
      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-fg-muted">
        {[phone.specs.displaySize, phone.specs.chipset, phone.specs.batteryMah && `${phone.specs.batteryMah.toLocaleString('en-US')}mAh`].filter(Boolean).join(' · ') || 'Specs coming soon'}
      </p>
    </Link>
  )
}

export function PhoneGrid({ phones, className }: { phones: PhoneView[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5', className)}>
      {phones.map((p, i) => (
        <PhoneCard key={p.slug} phone={p} priority={i < 4} />
      ))}
    </div>
  )
}

/** Filter chips: plain links to the indexable brand and price-band pages (no JavaScript needed) */
export function PhoneFilters({ brands, active }: { brands: BrandView[]; active?: { brand?: string; band?: number } }) {
  return (
    <div className="space-y-3" aria-label="Filter phones">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Brands">
        <Link href="/mobile-prices" role="listitem" className={cn('chip', !active?.brand && !active?.band && 'border-transparent bg-accent text-accent-fg')}>
          All brands
        </Link>
        {brands.map((b) => (
          <Link key={b.slug} href={`/mobile-prices/${b.slug}`} role="listitem" className={cn('chip', active?.brand === b.slug && 'border-transparent bg-accent text-accent-fg')}>
            {b.name}
          </Link>
        ))}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Price bands">
        <Link href="/mobile-prices/new-phones" role="listitem" className="chip whitespace-nowrap">
          New phones
        </Link>
        <Link href="/mobile-prices/upcoming" role="listitem" className="chip whitespace-nowrap">
          Upcoming
        </Link>
        {PRICE_BANDS.map((band) => (
          <Link key={band} href={`/mobile-prices/${bandSlug(band)}`} role="listitem" className={cn('chip', active?.band === band && 'border-transparent bg-accent text-accent-fg')}>
            Under Rs {bandLabel(band)}
          </Link>
        ))}
      </div>
    </div>
  )
}

export function PriceHistoryTable({ rows }: { rows: PriceHistoryRow[] }) {
  if (!rows.length) return <p className="text-sm text-fg-muted">No official price change recorded yet. We check the brand's Pakistan site every day and log every change here.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-start text-sm">
        <thead>
          <tr className="border-b border-border text-fg-muted">
            <th className="py-2 text-start">Date</th>
            <th className="py-2 text-start">Variant</th>
            <th className="py-2 text-start">Price</th>
            <th className="py-2 text-start">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((r, i) => (
            <tr key={`${r.date}-${r.variant}-${i}`} className="border-b border-border">
              <td className="py-2">{new Date(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' })}</td>
              <td className="py-2">{r.variant}</td>
              <td className="py-2 font-semibold tabular-nums">{priceText(r.pricePkr)}</td>
              <td className="py-2">
                {r.sourceUrl ? (
                  <a href={r.sourceUrl} rel="noopener nofollow" className="underline">
                    {hostOf(r.sourceUrl)}
                  </a>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { NOT_ANNOUNCED }
