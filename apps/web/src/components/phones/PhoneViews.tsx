import Link from 'next/link'
import { Smartphone } from 'lucide-react'
import { PRICE_BANDS, formatPkr, type FAQ } from '@zaviya/shared'
import { FAQAccordion } from '@/components/article/FAQAccordion'
import { PageHero } from '@/components/layout/PageHero'
import { JsonLd } from '@/components/seo/JsonLd'
import { PhoneFilters, PhoneGrid, PhoneImage, PriceHistoryTable, hostOf, phoneHref } from '@/components/phones/PhoneParts'
import { BuyButton } from '@/components/appliances/ApplianceViews'
import { absoluteUrl, breadcrumbJsonLd, faqJsonLd } from '@/lib/seo'
import {
  bandLabel,
  bandSlug,
  compareFaqs,
  compareRows,
  compareVerdict,
  dateText,
  highestPrice,
  itemListJsonLd,
  launchText,
  phoneFaqs,
  phoneJsonLd,
  phoneSummary,
  priceText,
  specRows,
  NOT_ANNOUNCED,
} from '@/lib/phones/logic'
import type { BrandView, PhonePair, PhoneView } from '@/lib/phones/types'

const COLOR = '#2563eb'
const HOME = { name: 'Home', url: '/' }
const HUB = { name: 'Mobile prices', url: '/mobile-prices' }

export function pairLabel(a: PhoneView, b: PhoneView) {
  return `${a.brand.name} ${a.name} vs ${b.brand.name} ${b.name}`
}

/** How the numbers are sourced: shown on every list so readers and Google see where prices come from */
export function SourcingNote() {
  return (
    <p className="rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed text-fg-muted">
      Prices are official PKR prices listed on each brand&apos;s Pakistan website or store, and PTA tax figures come from official notifications. We check them every day and keep the history. When a brand has not announced a price in Pakistan we write &quot;{NOT_ANNOUNCED}&quot; instead of guessing. Shop prices can differ.
    </p>
  )
}

// ---------- phone page ----------

export function PhonePageView({ phone, related, pairs, brandPhones }: { phone: PhoneView; related: PhoneView[]; pairs: { key: string; label: string }[]; brandPhones?: number }) {
  const url = absoluteUrl(phoneHref(phone.slug))
  const faqs = phoneFaqs(phone)
  const rows = specRows(phone)
  const full = `${phone.brand.name} ${phone.name}`
  const launched = launchText(phone)
  const high = highestPrice(phone.variants)
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([HOME, HUB, { name: phone.brand.name, url: `/mobile-prices/${phone.brand.slug}` }, { name: full, url: phoneHref(phone.slug) }]),
          phoneJsonLd(phone, url, phone.imageUrl),
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <PageHero
        title={`${full} price in Pakistan`}
        description={phoneSummary(phone)}
        icon={Smartphone}
        color={COLOR}
        eyebrow={phone.status === 'upcoming' ? 'Upcoming phone' : phone.status === 'discontinued' ? 'No longer sold' : `${phone.brand.name} mobile`}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mobile prices', href: '/mobile-prices' }, { label: phone.brand.name, href: `/mobile-prices/${phone.brand.slug}` }, { label: phone.name }]}
      />
      <div className="container-wide mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="card-surface flex items-center justify-center p-6">
            <PhoneImage phone={phone} size={240} priority />
          </div>
          <div className="card-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Price in Pakistan</p>
            <p className="mt-1 font-display text-3xl font-extrabold tabular-nums" data-testid="price">
              {phone.pricePkr ? `${phone.variants.filter((v) => v.pricePkr).length > 1 && high !== phone.pricePkr ? 'From ' : ''}${formatPkr(phone.pricePkr)}` : NOT_ANNOUNCED}
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              {phone.priceUpdatedAt ? `Last updated ${dateText(phone.priceUpdatedAt)}` : 'We update this page when an official price is published.'}
            </p>
            {phone.officialUrl && phone.status !== 'discontinued' && (
              <>
                <BuyButton url={phone.officialUrl} brand={phone.brand.name} className="mt-3 w-full" />
                <p className="mt-2 text-xs text-fg-subtle">Opens {hostOf(phone.officialUrl)}. Zaviya does not sell phones or earn from this link.</p>
              </>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          <section aria-labelledby="variants">
            <h2 id="variants" className="font-display text-xl font-bold">
              {full} price by RAM and storage
            </h2>
            {phone.variants.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[360px] border-collapse text-start">
                  <thead>
                    <tr className="border-b border-border text-sm text-fg-muted">
                      <th className="py-2 text-start">Variant</th>
                      <th className="py-2 text-start">Price (PKR)</th>
                      <th className="py-2 text-start">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phone.variants.map((v) => (
                      <tr key={v.label} className="border-b border-border">
                        <td className="py-2">{v.label}</td>
                        <td className="py-2 font-semibold tabular-nums">{priceText(v.pricePkr)}</td>
                        <td className="py-2 text-sm">
                          {v.sourceUrl && v.pricePkr ? (
                            <a href={v.sourceUrl} rel="noopener nofollow" className="underline">
                              {hostOf(v.sourceUrl)}
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
            ) : (
              <p className="mt-3 text-fg-muted">{NOT_ANNOUNCED}. {phone.brand.name} has not published RAM and storage options with prices for Pakistan.</p>
            )}
            {phone.pta && (phone.pta.status || phone.pta.taxPkr) && (
              <p className="mt-3 text-sm text-fg-muted">
                PTA: {phone.pta.status === 'approved' ? 'approved' : phone.pta.status === 'not-listed' ? 'not listed as approved' : 'status unknown'}
                {phone.pta.taxPkr ? `. Official PTA tax on an imported unit: ${formatPkr(phone.pta.taxPkr)}` : ''}
                {phone.pta.sourceUrl ? (
                  <>
                    {' '}
                    (<a href={phone.pta.sourceUrl} rel="noopener nofollow" className="underline">source</a>)
                  </>
                ) : null}
                .
              </p>
            )}
          </section>

          <section aria-labelledby="specs">
            <h2 id="specs" className="font-display text-xl font-bold">
              {full} specifications
            </h2>
            {rows.length ? (
              <table className="mt-3 w-full border-collapse text-start">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-border align-top">
                      <th scope="row" className="w-2/5 py-2 pe-3 text-start text-sm font-semibold text-fg-muted">
                        {r.label}
                      </th>
                      <td className="py-2">{r.value}</td>
                    </tr>
                  ))}
                  {launched && (
                    <tr className="border-b border-border">
                      <th scope="row" className="w-2/5 py-2 pe-3 text-start text-sm font-semibold text-fg-muted">
                        Launched
                      </th>
                      <td className="py-2">{launched}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <p className="mt-3 text-fg-muted">Full specifications are not published yet.</p>
            )}
            {phone.specsSourceUrl && (
              <p className="mt-2 text-xs text-fg-subtle">
                Specifications from the manufacturer:{' '}
                <a href={phone.specsSourceUrl} rel="noopener nofollow" className="underline">
                  {hostOf(phone.specsSourceUrl)}
                </a>
              </p>
            )}
          </section>

          <section aria-labelledby="history">
            <h2 id="history" className="font-display text-xl font-bold">
              {full} price history
            </h2>
            <div className="mt-3">
              <PriceHistoryTable rows={phone.priceHistory} />
            </div>
          </section>

          <SourcingNote />

          {pairs.length > 0 && (
            <section aria-labelledby="compare">
              <h2 id="compare" className="font-display text-xl font-bold">
                Compare {phone.name}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {pairs.map((p) => (
                  <li key={p.key}>
                    <Link href={`/compare/${p.key}`} className="chip">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {related.length > 0 && (
            <section aria-labelledby="related">
              <h2 id="related" className="font-display text-xl font-bold">
                Related phones
              </h2>
              <PhoneGrid phones={related} className="mt-3 lg:grid-cols-3 xl:grid-cols-3" />
              {brandPhones && brandPhones > 1 ? (
                <p className="mt-3 text-sm">
                  <Link href={`/mobile-prices/${phone.brand.slug}`} className="font-semibold text-accent underline">
                    All {phone.brand.name} phones and prices
                  </Link>
                </p>
              ) : null}
            </section>
          )}

          <FAQAccordion faqs={faqs} locale="en" />
        </div>
      </div>
    </div>
  )
}

// ---------- lists: hub, brand, under-X ----------

export function PhoneListView({
  title,
  description,
  crumbs,
  phones,
  brands,
  active,
  intro,
  faqs = [],
  children,
  extra,
  emptyText,
}: {
  title: string
  description: string
  crumbs: { label: string; href?: string; url?: string }[]
  phones: PhoneView[]
  brands: BrandView[]
  active?: { brand?: string; band?: number }
  intro?: React.ReactNode
  faqs?: FAQ[]
  children?: React.ReactNode
  extra?: React.ReactNode
  emptyText?: string
}) {
  const listLd = itemListJsonLd(title, phones.slice(0, 50).map((p) => ({ name: `${p.brand.name} ${p.name}`, url: absoluteUrl(phoneHref(p.slug)) })))
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs.map((c) => ({ name: c.label, url: c.href ?? c.url ?? '/mobile-prices' }))),
          ...(phones.length ? [listLd] : []),
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <PageHero title={title} description={description} icon={Smartphone} color={COLOR} eyebrow="Mobile prices in Pakistan" crumbs={crumbs} stats={[{ label: 'Phones listed', value: phones.length }]} />
      <div className="container-wide mt-8 space-y-8">
        <PhoneFilters brands={brands} active={active} />
        {intro}
        {extra}
        {phones.length ? <PhoneGrid phones={phones} /> : <p className="rounded-2xl border border-border bg-surface p-6 text-fg-muted">{emptyText ?? 'No phones listed here yet.'}</p>}
        {children}
        <SourcingNote />
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}

export function bandLinks() {
  return (
    <ul className="flex flex-wrap gap-2">
      {PRICE_BANDS.map((b) => (
        <li key={b}>
          <Link href={`/mobile-prices/${bandSlug(b)}`} className="chip">
            Phones under Rs {bandLabel(b)}
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ---------- compare ----------

export function ComparePageView({ a, b, pair }: { a: PhoneView; b: PhoneView; pair: PhonePair }) {
  const rows = compareRows(a, b)
  const verdict = compareVerdict(a, b)
  const faqs = compareFaqs(a, b)
  const label = pairLabel(a, b)
  return (
    <div className="pb-10">
      <JsonLd
        data={[
          breadcrumbJsonLd([HOME, HUB, { name: label, url: `/compare/${pair.key}` }]),
          ...(faqs.length ? [faqJsonLd(faqs)] : []),
        ]}
      />
      <PageHero
        title={label}
        description={`Price in Pakistan and specifications of ${a.brand.name} ${a.name} and ${b.brand.name} ${b.name}, side by side.`}
        icon={Smartphone}
        color={COLOR}
        eyebrow="Compare phones"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Mobile prices', href: '/mobile-prices' }, { label }]}
      />
      <div className="container-wide mt-8 max-w-[960px] space-y-8">
        <div className="grid grid-cols-2 gap-3">
          {[a, b].map((p) => (
            <Link key={p.slug} href={phoneHref(p.slug)} className="card-lift flex flex-col items-center p-4 text-center">
              <PhoneImage phone={p} size={140} priority />
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{p.brand.name}</p>
              <p className="font-display text-lg font-bold">{p.name}</p>
              <p className="mt-1 font-display text-lg font-extrabold tabular-nums">{p.pricePkr ? `From ${formatPkr(p.pricePkr)}` : NOT_ANNOUNCED}</p>
            </Link>
          ))}
        </div>

        {verdict.length > 0 && (
          <section>
            <h2 className="font-display text-xl font-bold">Key differences</h2>
            <ul className="mt-3 list-disc space-y-1.5 ps-5">
              {verdict.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-display text-xl font-bold">Specifications compared</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-start">
              <thead>
                <tr className="border-b border-border text-sm text-fg-muted">
                  <th className="py-2 text-start" />
                  <th className="py-2 text-start">{a.name}</th>
                  <th className="py-2 text-start">{b.name}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-border align-top">
                    <th scope="row" className="py-2 pe-3 text-start text-sm font-semibold text-fg-muted">
                      {r.label}
                    </th>
                    <td className="py-2 pe-3">{r.a}</td>
                    <td className="py-2">{r.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <SourcingNote />
        <FAQAccordion faqs={faqs} locale="en" />
      </div>
    </div>
  )
}
