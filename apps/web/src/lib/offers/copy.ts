import { formatPkr, offerGroupInfo, type FAQ } from '@zaviya/shared'
import type { OfferView } from './queries'

/** Questions people ask on store category and product pages, answered from the data on the page */
export function shopGroupFaqs(group: string, items: OfferView[], total: number): FAQ[] {
  const info = offerGroupInfo(group)
  if (!info) return []
  const name = info.name.toLowerCase()
  const priced = items.filter((o) => o.pricePkr).sort((a, b) => a.pricePkr! - b.pricePkr!)
  const out: FAQ[] = []
  if (priced.length) {
    out.push({
      q: `What is the price of ${name} in Pakistan?`,
      a: `${total.toLocaleString('en-US')} ${name} are listed on Pakistani store websites right now, from ${formatPkr(priced[0]!.pricePkr!)} to ${formatPkr(priced.at(-1)!.pricePkr!)} on this page. Open any item to see the price in each store.`,
    })
  }
  out.push(
    { q: 'Where do these prices come from?', a: "From each store's own website, read several times a day. Every item links to the store's product page so you can check the price and buy there." },
    { q: 'Does Zaviya sell these products?', a: 'No. Zaviya only shows prices. We do not sell anything and do not earn from the store links.' },
  )
  return out
}

export function offerFaqs(full: OfferView, stores: OfferView[]): FAQ[] {
  const o = { ...full, title: shortTitle(full.title) }
  const out: FAQ[] = []
  if (o.pricePkr) {
    const others = stores.filter((s) => s.slug !== o.slug && s.pricePkr)
    out.push({
      q: `What is the price of ${o.title} in Pakistan?`,
      a: `${o.title} is ${formatPkr(o.pricePkr)} at ${o.storeName}${o.seenAt ? ` (checked ${new Date(o.seenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })})` : ''}.${others.length ? ` It is also listed at ${others.map((s) => `${s.storeName} for ${formatPkr(s.pricePkr!)}`).join(', ')}.` : ''}`,
    })
  }
  if (o.prevPricePkr && o.pricePkr && o.prevPricePkr !== o.pricePkr) {
    out.push({ q: `Has the price of ${o.title} changed?`, a: `Yes. ${o.storeName} changed it from ${formatPkr(o.prevPricePkr)} to ${formatPkr(o.pricePkr)}.` })
  }
  out.push({ q: `Is ${o.title} in stock?`, a: o.inStock === false ? `${o.storeName} shows it as out of stock right now.` : `${o.storeName} shows it as in stock. Confirm on the store before you pay.` })
  return out
}

export const monthYear = (d = new Date()) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })

/** "Acer Predator Helios 16 AI PH16-73-95Q8 Gaming Laptop, Intel Core Ultra 9..." -> the part before the spec list, at most ~70 characters */
export function shortTitle(title: string, max = 70): string {
  let t = title.split(/\s[|–—]\s|,\s|\s-\s(?=[A-Z0-9])/)[0]!.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (t.length < 12) t = title
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  return cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : max).trim()
}
