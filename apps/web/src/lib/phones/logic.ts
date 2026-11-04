import { PRICE_BANDS, formatPkr, type FAQ, type PriceBand } from '@zaviya/shared'
import type { PhonePair, PhoneView, PhoneVariantView } from './types'

export const NOT_ANNOUNCED = 'Price not announced'

/** Lowest official price among variants; null when none has one */
export function lowestPrice(variants: Pick<PhoneVariantView, 'pricePkr'>[]): number | null {
  const prices = variants.map((v) => v.pricePkr).filter((p): p is number => typeof p === 'number' && p > 0)
  return prices.length ? Math.min(...prices) : null
}

export function highestPrice(variants: Pick<PhoneVariantView, 'pricePkr'>[]): number | null {
  const prices = variants.map((v) => v.pricePkr).filter((p): p is number => typeof p === 'number' && p > 0)
  return prices.length ? Math.max(...prices) : null
}

/** "Rs 45,999", or "Price not announced": a price is never made up */
export function priceText(price: number | null | undefined): string {
  return typeof price === 'number' && price > 0 ? formatPkr(price) : NOT_ANNOUNCED
}

/** Hub/card line: "From Rs 45,999" or "Price not announced" */
export function fromPriceText(phone: Pick<PhoneView, 'pricePkr'>): string {
  return phone.pricePkr ? `From ${formatPkr(phone.pricePkr)}` : NOT_ANNOUNCED
}

export function isPriceBand(n: number): n is PriceBand {
  return (PRICE_BANDS as readonly number[]).includes(n)
}

/** "under-30000" -> 30000 (only the five published bands) */
export function parseBandSlug(slug: string): PriceBand | null {
  const m = /^under-(\d{4,6})$/.exec(slug)
  const n = m ? Number(m[1]) : NaN
  return isPriceBand(n) ? n : null
}

export const bandSlug = (band: number) => `under-${band}`

/** Rs 30,000 -> "30,000" (labels and titles) */
export const bandLabel = (band: number) => band.toLocaleString('en-US')

/** Popular first, then cheaper first. Phones without a price go last. */
export function sortPhones(phones: PhoneView[]): PhoneView[] {
  return [...phones].sort((a, b) => {
    if (b.popularity !== a.popularity) return b.popularity - a.popularity
    if (a.pricePkr == null && b.pricePkr != null) return 1
    if (b.pricePkr == null && a.pricePkr != null) return -1
    return (a.pricePkr ?? 0) - (b.pricePkr ?? 0) || a.name.localeCompare(b.name)
  })
}

export function phonesUnder(phones: PhoneView[], band: number): PhoneView[] {
  return sortPhones(phones.filter((p) => p.status !== 'upcoming' && p.pricePkr != null && p.pricePkr <= band))
}

/** An under-X list is only indexed when it has enough phones to be useful */
export const MIN_INDEXABLE_LIST = 3

/** Cheapest first, for "price" listings */
export function byPriceAsc(phones: PhoneView[]): PhoneView[] {
  return [...phones].sort((a, b) => (a.pricePkr ?? Infinity) - (b.pricePkr ?? Infinity) || b.popularity - a.popularity)
}

/** Phones whose price changed in the last `days`: [phone, last change] newest first */
export function recentPriceChanges(phones: PhoneView[], now: Date, days = 14): { phone: PhoneView; from: number | null; to: number; date: string }[] {
  const cutoff = now.getTime() - days * 86400_000
  const out: { phone: PhoneView; from: number | null; to: number; date: string }[] = []
  for (const phone of phones) {
    const rows = [...phone.priceHistory].sort((a, b) => a.date.localeCompare(b.date))
    const last = rows[rows.length - 1]
    if (!last || Date.parse(last.date) < cutoff) continue
    const before = [...rows].reverse().find((r) => r.variant === last.variant && r !== last)
    // The first record of a phone is not a "change"
    if (!before) continue
    out.push({ phone, from: before.pricePkr, to: last.pricePkr, date: last.date })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/** The brand's phones on sale, used for related phones: same brand first by closeness in price, then other brands in the same price range */
export function relatedPhones(phone: PhoneView, all: PhoneView[], limit = 6): PhoneView[] {
  const pool = all.filter((p) => p.slug !== phone.slug && p.status !== 'upcoming')
  const dist = (p: PhoneView) => (phone.pricePkr && p.pricePkr ? Math.abs(Math.log(p.pricePkr / phone.pricePkr)) : 5)
  const same = pool.filter((p) => p.brand.slug === phone.brand.slug).sort((a, b) => dist(a) - dist(b) || b.popularity - a.popularity)
  const other = pool
    .filter((p) => p.brand.slug !== phone.brand.slug && phone.pricePkr != null && p.pricePkr != null && dist(p) < 0.25)
    .sort((a, b) => dist(a) - dist(b) || b.popularity - a.popularity)
  const out: PhoneView[] = []
  const nSame = Math.min(same.length, Math.ceil(limit / 2))
  out.push(...same.slice(0, nSame))
  out.push(...other.slice(0, limit - out.length))
  if (out.length < limit) out.push(...same.slice(nSame, nSame + limit - out.length))
  return out
}

/**
 * The compare pages we publish: the most popular phones against their closest rival in the same brand
 * (previous/next model by price) and in other brands (within about 20% price). Deterministic, at most `max` pairs.
 */
export function popularPairs(phones: PhoneView[], max = 60): PhonePair[] {
  const pool = sortPhones(phones.filter((p) => p.status !== 'upcoming' && (p.pricePkr != null || Object.keys(p.specs).length >= 4)))
  const top = pool.slice(0, Math.max(10, Math.ceil(max * 0.8)))
  const seen = new Set<string>()
  const pairs: PhonePair[] = []
  const add = (x: PhoneView, y: PhoneView) => {
    if (x.slug === y.slug) return
    const [a, b] = x.slug < y.slug ? [x, y] : [y, x]
    const key = `${a.slug}-vs-${b.slug}`
    if (seen.has(key) || pairs.length >= max) return
    seen.add(key)
    pairs.push({ key, a: a.slug, b: b.slug })
  }
  const dist = (x: PhoneView, y: PhoneView) => (x.pricePkr && y.pricePkr ? Math.abs(Math.log(x.pricePkr / y.pricePkr)) : 9)
  // cross-brand first: these are the searches ("samsung a17 vs redmi 14c")
  for (const p of top) {
    const rival = pool.filter((q) => q.brand.slug !== p.brand.slug && dist(p, q) < 0.2).sort((x, y) => dist(p, x) - dist(p, y) || y.popularity - x.popularity)[0]
    if (rival) add(p, rival)
  }
  for (const p of top) {
    const sib = pool.filter((q) => q.brand.slug === p.brand.slug && q.slug !== p.slug).sort((x, y) => dist(p, x) - dist(p, y) || y.popularity - x.popularity)[0]
    if (sib) add(p, sib)
  }
  return pairs
}

export function findPair(pairs: PhonePair[], key: string): PhonePair | null {
  return pairs.find((p) => p.key === key) ?? null
}

// ---------- text (original, built only from our own data) ----------

const fmt = (n: number) => n.toLocaleString('en-US')

export function ramStorageText(variants: PhoneVariantView[]): string {
  return variants.map((v) => v.label).join(', ')
}

/** A short original summary built from the stored specs. An editor-written summary wins. Never states anything we do not have. */
export function phoneSummary(p: PhoneView): string {
  if (p.summary?.trim()) return p.summary.trim()
  const s = p.specs
  const bits: string[] = []
  const first = [
    s.displaySize && `a ${s.displaySize}${s.displayType ? ` ${s.displayType}` : ''} display${s.refreshRateHz ? ` at ${s.refreshRateHz}Hz` : ''}`,
    s.chipset && `the ${s.chipset} chipset`,
  ].filter(Boolean)
  if (first.length) bits.push(`The ${p.brand.name} ${p.name} comes with ${first.join(' and ')}.`)
  const second = [
    s.batteryMah && `a ${fmt(s.batteryMah)}mAh battery${s.chargingW ? ` with ${s.chargingW}W charging` : ''}`,
    s.rearCamera && `a ${s.rearCamera} rear camera`,
  ].filter(Boolean)
  if (second.length) bits.push(`It packs ${second.join(' and ')}.`)
  const memory = p.variants.length ? ramStorageText(p.variants) : ''
  if (memory) bits.push(`Memory options: ${memory}.`)
  bits.push(p.pricePkr ? `The lowest official price we found in Pakistan is ${formatPkr(p.pricePkr)}.` : `${p.brand.name} has not announced an official Pakistan price for this phone yet.`)
  if (!first.length && !second.length && !memory) bits.unshift(`${p.brand.name} ${p.name} is listed on Zaviya with the information we could verify from official sources.`)
  return bits.join(' ')
}

export function launchText(p: PhoneView): string | null {
  if (!p.launchDate) return null
  const d = new Date(p.launchDate)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** FAQ built from facts we hold. A question is only asked when we can answer it. */
export function phoneFaqs(p: PhoneView): FAQ[] {
  const faqs: FAQ[] = []
  const full = `${p.brand.name} ${p.name}`
  if (p.pricePkr) {
    const priced = p.variants.filter((v) => v.pricePkr)
    const lines = priced.map((v) => `${v.label}: ${formatPkr(v.pricePkr!)}`).join('; ')
    faqs.push({ q: `What is the price of ${full} in Pakistan?`, a: `${full} starts at ${formatPkr(p.pricePkr)} in Pakistan${priced.length > 1 ? ` (${lines})` : ''}. This is the official price listed by ${p.brand.name} Pakistan${p.priceUpdatedAt ? `, last checked on ${dateText(p.priceUpdatedAt)}` : ''}. Shop prices can differ.` })
  } else {
    faqs.push({ q: `What is the price of ${full} in Pakistan?`, a: `${p.brand.name} has not announced an official Pakistan price for ${p.name}, so we do not show one. We update this page when an official price is published.` })
  }
  const memory = p.variants.length ? ramStorageText(p.variants) : ''
  if (memory) faqs.push({ q: `How much RAM and storage does ${p.name} have?`, a: `${full} is listed in these RAM and storage options: ${memory}.` })
  if (p.specs.batteryMah) faqs.push({ q: `What is the battery size of ${p.name}?`, a: `${full} has a ${fmt(p.specs.batteryMah)}mAh battery${p.specs.chargingW ? ` and supports ${p.specs.chargingW}W charging` : ''}.` })
  if (p.specs.rearCamera) faqs.push({ q: `How good is the camera of ${p.name}?`, a: `${full} has ${p.specs.rearCamera} on the back${p.specs.frontCamera ? ` and a ${p.specs.frontCamera} selfie camera` : ''}.` })
  if (p.specs.network) faqs.push({ q: `Does ${p.name} support 5G in Pakistan?`, a: /5g/i.test(p.specs.network) ? `${full} supports 5G, but 5G service in Pakistan depends on your operator and city.` : `${full} is a ${p.specs.network} phone and does not list 5G support.` })
  if (p.pta?.status === 'approved') faqs.push({ q: `Is ${p.name} PTA approved?`, a: `Yes. ${full} is listed as PTA approved${p.pta.note ? `: ${p.pta.note}` : ''}.${p.pta.taxPkr ? ` Official PTA tax for an imported unit: ${formatPkr(p.pta.taxPkr)}.` : ''}` })
  else if (p.pta?.taxPkr) faqs.push({ q: `How much PTA tax is on ${p.name}?`, a: `An official PTA notification lists ${formatPkr(p.pta.taxPkr)} tax for an imported ${full}.` })
  const l = launchText(p)
  if (l) faqs.push({ q: `When was ${p.name} launched?`, a: `${full} was launched in ${l}.` })
  return faqs
}

export function dateText(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })
}

// ---------- compare ----------

export interface CompareRow {
  label: string
  a: string
  b: string
}

const val = (v: string | number | undefined | null, unit = '') => (v === undefined || v === null || v === '' ? '-' : `${typeof v === 'number' ? fmt(v) : v}${unit}`)

export function specRows(p: PhoneView): { label: string; value: string }[] {
  const s = p.specs
  const rows: { label: string; value: string }[] = [
    { label: 'Display', value: [s.displaySize, s.displayType, s.displayResolution, s.refreshRateHz && `${s.refreshRateHz}Hz`].filter(Boolean).join(', ') },
    { label: 'Chipset', value: s.chipset ?? '' },
    { label: 'RAM and storage', value: p.variants.length ? ramStorageText(p.variants) : '' },
    { label: 'Rear camera', value: s.rearCamera ?? '' },
    { label: 'Front camera', value: s.frontCamera ?? '' },
    { label: 'Battery', value: s.batteryMah ? `${fmt(s.batteryMah)}mAh${s.chargingW ? `, ${s.chargingW}W charging` : ''}` : '' },
    { label: 'Operating system', value: s.os ?? '' },
    { label: 'Network', value: s.network ?? '' },
    { label: 'SIM', value: s.sim ?? '' },
    { label: 'Weight', value: s.weightG ? `${s.weightG}g` : '' },
    { label: 'Dimensions', value: s.dimensions ?? '' },
    { label: 'Protection', value: s.protection ?? '' },
    { label: 'Colours', value: p.colours.join(', ') },
  ]
  return rows.filter((r) => r.value)
}

export function compareRows(a: PhoneView, b: PhoneView): CompareRow[] {
  const ra = specRows(a)
  const rb = specRows(b)
  const labels = [...new Set([...ra.map((r) => r.label), ...rb.map((r) => r.label)])]
  const rows: CompareRow[] = [{ label: 'Price in Pakistan', a: a.pricePkr ? `From ${formatPkr(a.pricePkr)}` : NOT_ANNOUNCED, b: b.pricePkr ? `From ${formatPkr(b.pricePkr)}` : NOT_ANNOUNCED }]
  for (const label of labels) rows.push({ label, a: ra.find((r) => r.label === label)?.value ?? '-', b: rb.find((r) => r.label === label)?.value ?? '-' })
  return rows
}

/** Short comparison sentences, only from numbers both phones have */
export function compareVerdict(a: PhoneView, b: PhoneView): string[] {
  const out: string[] = []
  const na = `${a.brand.name} ${a.name}`
  const nb = `${b.brand.name} ${b.name}`
  if (a.pricePkr && b.pricePkr && a.pricePkr !== b.pricePkr) {
    const [cheap, dear] = a.pricePkr < b.pricePkr ? [a, b] : [b, a]
    out.push(`${cheap.brand.name} ${cheap.name} is cheaper: it starts at ${formatPkr(cheap.pricePkr!)}, against ${formatPkr(dear.pricePkr!)} for ${dear.brand.name} ${dear.name} (a difference of ${formatPkr(dear.pricePkr! - cheap.pricePkr!)}).`)
  } else if (!a.pricePkr || !b.pricePkr) {
    const missing = [!a.pricePkr && na, !b.pricePkr && nb].filter(Boolean).join(' and ')
    out.push(`No official Pakistan price is announced yet for ${missing}, so we do not compare prices.`)
  }
  const bigger = (label: string, unit: string, x?: number, y?: number) => {
    if (x && y && x !== y) {
      const [w, l, wx, lx] = x > y ? [na, nb, x, y] : [nb, na, y, x]
      out.push(`${w} has the larger ${label} (${fmt(wx)}${unit} against ${fmt(lx)}${unit} on ${l}).`)
    }
  }
  bigger('battery', 'mAh', a.specs.batteryMah, b.specs.batteryMah)
  bigger('charging speed', 'W', a.specs.chargingW, b.specs.chargingW)
  bigger('screen refresh rate', 'Hz', a.specs.refreshRateHz, b.specs.refreshRateHz)
  return out
}

export function compareFaqs(a: PhoneView, b: PhoneView): FAQ[] {
  const na = `${a.brand.name} ${a.name}`
  const nb = `${b.brand.name} ${b.name}`
  const faqs: FAQ[] = [{ q: `Which is cheaper, ${na} or ${nb}?`, a: compareVerdict(a, b)[0] ?? `We could not compare prices for ${na} and ${nb}.` }]
  const battery = compareVerdict(a, b).find((l) => l.includes('larger battery'))
  if (battery) faqs.push({ q: `Which has the bigger battery, ${a.name} or ${b.name}?`, a: battery })
  const chip = [a.specs.chipset && `${na} uses ${a.specs.chipset}`, b.specs.chipset && `${nb} uses ${b.specs.chipset}`].filter(Boolean).join('; ')
  if (a.specs.chipset && b.specs.chipset) faqs.push({ q: `Which has the better processor, ${a.name} or ${b.name}?`, a: `${chip}. Compare the chipsets in the table above before you decide.` })
  return faqs
}

// ---------- schema.org ----------

export function phoneJsonLd(p: PhoneView, url: string, absoluteImage?: string) {
  const prices = p.variants.map((v) => v.pricePkr).filter((x): x is number => !!x)
  const low = prices.length ? Math.min(...prices) : null
  const high = prices.length ? Math.max(...prices) : null
  const offers =
    low == null
      ? undefined
      : low === high
        ? { '@type': 'Offer', url, priceCurrency: 'PKR', price: String(low), availability: p.status === 'discontinued' ? 'https://schema.org/Discontinued' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition' }
        : { '@type': 'AggregateOffer', url, priceCurrency: 'PKR', lowPrice: String(low), highPrice: String(high), offerCount: prices.length, availability: p.status === 'discontinued' ? 'https://schema.org/Discontinued' : 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition' }
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${p.brand.name} ${p.name}`,
    brand: { '@type': 'Brand', name: p.brand.name },
    category: 'Mobile phone',
    description: phoneSummary(p),
    url,
    ...(absoluteImage ? { image: [absoluteImage] } : {}),
    ...(p.launchDate ? { releaseDate: p.launchDate.slice(0, 10) } : {}),
    ...(offers ? { offers } : {}),
  }
}

export function itemListJsonLd(name: string, items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: it.url })),
  }
}
