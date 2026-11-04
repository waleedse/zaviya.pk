import { formatPkr, type FAQ } from '@zaviya/shared'
import { bandLabel, byPriceAsc } from './logic'
import type { BrandView, PhoneView } from './types'

export const findPhone = (phones: PhoneView[], slug: string) => phones.find((p) => p.slug === slug) ?? null

export function hubFaqs(count: number): FAQ[] {
  return [
    {
      q: 'Where do the mobile prices on Zaviya come from?',
      a: 'From the official Pakistan websites and stores of each brand, and PTA tax figures only from official PTA notifications. Every price on a phone page links to its source, and we check them every day.',
    },
    {
      q: 'Why does a phone say "Price not announced"?',
      a: 'Because the brand has not published an official price in Pakistan. We never estimate or copy a price from a shop, so the page stays without a number until an official one appears.',
    },
    {
      q: 'Are these prices PTA tax paid?',
      a: 'The prices are what the brand lists for Pakistan, for PTA-approved units sold locally. Where an official PTA notification states the tax on an imported phone, we show it on that phone page with the source.',
    },
    ...(count ? [{ q: 'How many phones does Zaviya list?', a: `Zaviya lists ${count} phones from the top brands in Pakistan, and the catalogue grows every week.` }] : []),
  ]
}

export function brandFaqs(brand: BrandView, phones: PhoneView[]): FAQ[] {
  const priced = byPriceAsc(phones.filter((p) => p.pricePkr != null && p.status !== 'upcoming'))
  const faqs: FAQ[] = []
  if (priced.length) {
    const lo = priced[0]!
    const hi = priced[priced.length - 1]!
    faqs.push({
      q: `What is the cheapest ${brand.name} phone in Pakistan?`,
      a: `Among the ${brand.name} phones with an official price, the cheapest is the ${lo.name} at ${formatPkr(lo.pricePkr!)}. The most expensive listed is the ${hi.name} at ${formatPkr(hi.pricePkr!)}.`,
    })
  }
  faqs.push({
    q: `Where do ${brand.name} mobile prices in Pakistan come from?`,
    a: `From ${brand.name}'s official Pakistan website or store. Each phone page shows the source of its price and the date we last checked it. Phones without an official price say "Price not announced".`,
  })
  const noPrice = phones.filter((p) => p.pricePkr == null && p.status !== 'upcoming').length
  if (noPrice) faqs.push({ q: `Why do some ${brand.name} phones have no price?`, a: `${noPrice} of the ${brand.name} phones listed have no official Pakistan price published yet, so we show "Price not announced" and do not guess.` })
  return faqs
}

export function bandFaqs(band: number, phones: PhoneView[]): FAQ[] {
  const label = `Rs ${bandLabel(band)}`
  const sorted = byPriceAsc(phones)
  const faqs: FAQ[] = []
  if (sorted.length) {
    const top = [...phones].slice(0, 3).map((p) => `${p.brand.name} ${p.name} (${formatPkr(p.pricePkr!)})`)
    faqs.push({ q: `Which phones cost under ${label} in Pakistan?`, a: `${phones.length} phones have an official price of ${label} or less, including ${top.join(', ')}. The list above is sorted by popularity.` })
    const cheapest = sorted[0]!
    faqs.push({ q: `What is the cheapest phone under ${label}?`, a: `The cheapest phone in this list is the ${cheapest.brand.name} ${cheapest.name} at ${formatPkr(cheapest.pricePkr!)}.` })
  }
  faqs.push({ q: `Are these prices official?`, a: `Yes. They are the prices brands list on their Pakistan websites and stores, checked daily. Phones without an official price are not included in this list.` })
  return faqs
}
