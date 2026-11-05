import { APPLIANCE_BRANDS, APPLIANCE_CATEGORIES, PRICE_GROUPS, formatPkr, type CityPrice, type PriceGroupSlug, type PriceSourceKind } from '@zaviya/shared'

/** An item on /prices as the pages use it (plain data): appliance, motorcycle, car or weekly grocery price */
export interface ApplianceView {
  id: string | number
  slug: string
  name: string
  nameUr?: string
  model?: string
  unit?: string
  brand: { slug: string; name: string; kind: PriceSourceKind }
  category: { slug: string; name: string; singular: string; ur: string; group: PriceGroupSlug }
  cityPrices: CityPrice[]
  hotScore: number
  pricePkr: number | null
  listPricePkr: number | null
  inStock: boolean | null
  priceUpdatedAt?: string
  imageUrl?: string
  officialUrl: string
  summary?: string
  specs: { label: string; value: string }[]
  priceHistory: { date: string; pricePkr: number; sourceUrl?: string }[]
  popularity: number
  updatedAt?: string
}

export type CategoryDef = (typeof APPLIANCE_CATEGORIES)[number]

/** A list page with fewer items than this is thin: noindex and out of the sitemap */
export const MIN_INDEXABLE_APPLIANCE_LIST = 3

export const categoryBySlug = (slug: string): CategoryDef | undefined => APPLIANCE_CATEGORIES.find((c) => c.slug === slug)
export const brandName = (slug: string): string => APPLIANCE_BRANDS.find((b) => b.slug === slug)?.name ?? slug
export const brandKind = (slug: string): PriceSourceKind => APPLIANCE_BRANDS.find((b) => b.slug === slug)?.kind ?? 'store'
export const groupBySlug = (slug: string) => PRICE_GROUPS.find((g) => g.slug === slug)

/** "Honda CD 70", "Toyota Yaris GLI 1.3 MT"; a statistics item has no brand: "Atta (Wheat Flour) 20 kg Bag" */
export function fullName(a: Pick<ApplianceView, 'name' | 'brand'>): string {
  if (a.brand.kind === 'source') return a.name
  return a.name.toLowerCase().startsWith(a.brand.name.toLowerCase()) ? a.name : `${a.brand.name} ${a.name}`
}

/** Month and year for titles: "November 2026" (prices change; searches carry the month) */
export function monthYear(d = new Date()): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })
}

/** Where the price comes from, in words, for the page and the FAQs */
export function sourceText(a: Pick<ApplianceView, 'brand' | 'category'>): string {
  if (a.brand.kind === 'source') return "the Pakistan Bureau of Statistics' weekly price survey (17 cities)"
  if (a.brand.kind === 'maker') return `${a.brand.name} Pakistan's own price list`
  return `the official ${a.brand.name} store`
}

/** Most searched and most viewed first: the "Trending prices" row */
export function trendingItems(all: ApplianceView[], max = 12): ApplianceView[] {
  return all
    .filter((a) => applianceIndexable(a) && a.hotScore > 0)
    .sort((a, b) => b.hotScore - a.hotScore || b.popularity - a.popularity)
    .slice(0, max)
}

/** An appliance page is indexed only with an official price (the same rule as phones, 5 Nov 2026) */
export function applianceIndexable(a: { pricePkr: number | null }): boolean {
  return typeof a.pricePkr === 'number' && a.pricePkr > 0
}

export function priceText(a: Pick<ApplianceView, 'pricePkr'>): string {
  return a.pricePkr ? formatPkr(a.pricePkr) : 'Price not shown by the brand'
}

/** "Save Rs 3,000 (6%)" when the brand shows a higher "was" price */
export function discountText(a: Pick<ApplianceView, 'pricePkr' | 'listPricePkr'>): string | null {
  if (!a.pricePkr || !a.listPricePkr || a.listPricePkr <= a.pricePkr) return null
  const off = a.listPricePkr - a.pricePkr
  return `Rs ${off.toLocaleString('en-US')} off the brand's earlier price (${Math.round((off / a.listPricePkr) * 100)}%)`
}

/** Cheapest first; unpriced last, then by popularity */
export function sortByPrice(list: ApplianceView[]): ApplianceView[] {
  return [...list].sort((a, b) => {
    if (a.pricePkr == null && b.pricePkr == null) return b.popularity - a.popularity
    if (a.pricePkr == null) return 1
    if (b.pricePkr == null) return -1
    return a.pricePkr - b.pricePkr
  })
}

export interface CategorySummary {
  category: CategoryDef
  count: number
  priced: number
  minPrice: number | null
  maxPrice: number | null
  brands: string[]
}

export function categorySummaries(all: ApplianceView[], group?: PriceGroupSlug): CategorySummary[] {
  return APPLIANCE_CATEGORIES.filter((c) => !group || c.group === group).map((category) => {
    const items = all.filter((a) => a.category.slug === category.slug)
    const prices = items.map((a) => a.pricePkr).filter((p): p is number => typeof p === 'number' && p > 0)
    return {
      category,
      count: items.length,
      priced: prices.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      brands: [...new Set(items.map((a) => a.brand.name))],
    }
  }).filter((s) => s.count > 0)
}

/** Same category, priced within about 30% of this one, other items first from other brands: "similar products" */
export function similarAppliances(a: ApplianceView, all: ApplianceView[], max = 6): ApplianceView[] {
  const pool = all.filter((x) => x.slug !== a.slug && x.category.slug === a.category.slug && applianceIndexable(x))
  if (!a.pricePkr) return sortByPrice(pool).slice(0, max)
  const p = a.pricePkr
  return pool
    .map((x) => ({ x, d: Math.abs((x.pricePkr ?? 0) - p) / p + (x.brand.slug === a.brand.slug ? 0.15 : 0) }))
    .filter(({ x }) => Math.abs((x.pricePkr ?? 0) - p) / p <= 0.3)
    .sort((m, n) => m.d - n.d)
    .slice(0, max)
    .map(({ x }) => x)
}

/** Compare URL key: slugs sorted, so a-vs-b and b-vs-a are one page */
export function compareKey(a: string, b: string): string {
  return a < b ? `${a}-vs-${b}` : `${b}-vs-${a}`
}

/** Splits "<slug>-vs-<slug>" knowing the real slugs (slugs themselves may contain "-vs-") */
export function findComparePair(key: string, all: ApplianceView[]): { a: ApplianceView; b: ApplianceView; key: string } | null {
  const bySlug = new Map(all.map((x) => [x.slug, x]))
  let i = key.indexOf('-vs-')
  while (i !== -1) {
    const a = bySlug.get(key.slice(0, i))
    const b = bySlug.get(key.slice(i + 4))
    if (a && b && a.slug !== b.slug && a.category.slug === b.category.slug) return { a, b, key: compareKey(a.slug, b.slug) }
    i = key.indexOf('-vs-', i + 1)
  }
  return null
}

/** Pairs for the sitemap and "compare with" links: each priced item with its two closest priced rivals in the category */
export function comparePairs(all: ApplianceView[], max = 200): { key: string; a: string; b: string }[] {
  const seen = new Set<string>()
  const out: { key: string; a: string; b: string }[] = []
  // most searched and viewed first, so the pairs people look for are always in the sitemap
  const priced = all.filter(applianceIndexable).sort((x, y) => y.hotScore - x.hotScore || y.popularity - x.popularity)
  for (const a of priced) {
    for (const b of similarAppliances(a, all, 2)) {
      const key = compareKey(a.slug, b.slug)
      if (seen.has(key)) continue
      seen.add(key)
      const [x, y] = a.slug < b.slug ? [a.slug, b.slug] : [b.slug, a.slug]
      out.push({ key, a: x, b: y })
      if (out.length >= max) return out
    }
  }
  return out
}

/** Spec rows side by side: union of labels, "—" where a product does not list one */
export function compareSpecRows(a: ApplianceView, b: ApplianceView): { label: string; a: string; b: string }[] {
  const rows = [{ label: 'Price in Pakistan', a: priceText(a), b: priceText(b) }]
  if (a.brand.kind !== 'source' || b.brand.kind !== 'source') rows.push({ label: 'Brand', a: a.brand.name, b: b.brand.name })
  if (a.unit || b.unit) rows.push({ label: 'Price for', a: a.unit ?? '—', b: b.unit ?? '—' })
  if (a.model || b.model) rows.push({ label: 'Model', a: a.model ?? '—', b: b.model ?? '—' })
  const labels = [...new Set([...a.specs.map((s) => s.label), ...b.specs.map((s) => s.label)])]
  for (const label of labels) {
    rows.push({ label, a: a.specs.find((s) => s.label === label)?.value ?? '—', b: b.specs.find((s) => s.label === label)?.value ?? '—' })
  }
  return rows
}

export function compareVerdict(a: ApplianceView, b: ApplianceView): string {
  if (a.pricePkr && b.pricePkr && a.pricePkr !== b.pricePkr) {
    const [cheap, dear] = a.pricePkr < b.pricePkr ? [a, b] : [b, a]
    return `${fullName(cheap)} is ${formatPkr(dear.pricePkr! - cheap.pricePkr!)} cheaper than ${fullName(dear)} at the official prices.`
  }
  return `Both are listed in ${a.category.name.toLowerCase()} with official Pakistan prices; compare the details below.`
}

/** Our own short summary when the editor wrote none */
export function applianceSummary(a: ApplianceView): string {
  if (a.summary) return a.summary
  if (a.brand.kind === 'source') {
    const cities = a.cityPrices.length
    return a.pricePkr
      ? `${a.name} costs ${formatPkr(a.pricePkr)} on average in Pakistan this week${a.unit ? ` (${a.unit})` : ''}, from ${sourceText(a)}${cities ? `, with the price in each of ${cities} cities below` : ''}.`
      : `${a.name}: no average price this week.`
  }
  const bits = a.specs.filter((s) => !/^price type$/i.test(s.label)).slice(0, 3).map((s) => `${s.label.toLowerCase()} ${s.value}`)
  const what = a.category.group === 'vehicles' && a.brand.kind === 'maker' ? 'ex-factory price' : 'price'
  const price = a.pricePkr ? `has an official ${what} of ${formatPkr(a.pricePkr)} on ${sourceText(a)}` : `is listed on ${sourceText(a)} without a price`
  return `The ${fullName(a)} ${price}.${bits.length ? ` Key specs: ${bits.join(', ')}.` : ''}`
}

// ---------- FAQs (built only from the data we list) ----------

export interface Faq {
  q: string
  a: string
}

export function hubFaqs(total: number): Faq[] {
  return [
    {
      q: 'Where do these prices come from?',
      a: "Only from official sources: each brand's own Pakistan store for appliances and motorcycles, the makers' own price lists for cars, and the Pakistan Bureau of Statistics' weekly survey of 17 cities for atta, sugar, ghee, milk, eggs, LPG and other groceries. Every page links to its source. We never copy prices from shops or other websites.",
    },
    {
      q: 'How often are prices updated?',
      a: 'Brand stores and car and bike price lists are checked every day; grocery prices every week when PBS publishes its survey. Every change is kept in the price history.',
    },
    {
      q: 'Why is my brand not listed?',
      a: 'Some brands do not show prices on their own website, so we cannot list an official price for them. We add a brand as soon as it publishes prices.',
    },
    ...(total ? [{ q: 'How many prices are listed?', a: `${total} items across groceries, motorcycles, cars, ACs, fridges, washing machines, geysers, heaters, fans and kitchen appliances, and the list grows every month.` }] : []),
  ]
}

export function categoryFaqs(cat: { name: string; singular: string; group?: PriceGroupSlug }, items: ApplianceView[], brandLabel?: string): Faq[] {
  const priced = sortByPrice(items.filter(applianceIndexable))
  const who = brandLabel ? `${brandLabel} ${cat.name.toLowerCase()}` : cat.name.toLowerCase()
  const faqs: Faq[] = []
  if (cat.group === 'groceries') {
    for (const a of [...priced].sort((x, y) => y.popularity - x.popularity).slice(0, 4)) {
      const cheapest = [...a.cityPrices].sort((x, y) => x.avg - y.avg)[0]
      faqs.push({ q: `What is the price of ${a.name.toLowerCase()} in Pakistan today?`, a: `${formatPkr(a.pricePkr!)} on average this week${cheapest ? `; the lowest city average is ${formatPkr(Math.round(cheapest.avg))} in ${cheapest.city}` : ''} (Pakistan Bureau of Statistics weekly survey).` })
    }
    faqs.push({ q: 'Where do these grocery prices come from?', a: "From the Pakistan Bureau of Statistics' Sensitive Price Indicator, collected every week in 50 markets of 17 cities. We show the national average and the lowest, average and highest price in each city." })
    faqs.push({ q: 'How often are they updated?', a: 'Every week, the day PBS publishes the new survey (usually Friday). Older weeks stay in the price history.' })
    return faqs
  }
  if (priced.length) {
    const lo = priced[0]!
    const hi = priced[priced.length - 1]!
    const where = cat.group === 'vehicles' ? 'the makers\' official price lists' : "the brands' official stores"
    faqs.push({ q: `What is the price of ${who} in Pakistan?`, a: `On ${where}, ${who} start at ${formatPkr(lo.pricePkr!)} (${fullName(lo)})${hi !== lo ? ` and go up to ${formatPkr(hi.pricePkr!)} (${fullName(hi)})` : ''}.` })
    faqs.push({ q: `Which is the cheapest ${cat.singular.toLowerCase()} listed?`, a: `${fullName(lo)} at ${formatPkr(lo.pricePkr!)}, the lowest official price we found today.` })
  }
  if (cat.group === 'vehicles') faqs.push({ q: 'Are these on-road prices?', a: 'No. Car makers publish ex-factory prices; registration, withholding tax (higher for non-filers) and freight are added by the dealer. Motorcycle prices are the retail prices on the maker\'s own store.' })
  faqs.push({ q: 'How often are prices updated?', a: 'Every day. When a price changes we record the old and new price in the price history on the product page.' })
  return faqs
}

export function productFaqs(a: ApplianceView): Faq[] {
  const full = fullName(a)
  const faqs: Faq[] = []
  if (a.brand.kind === 'source') {
    if (a.pricePkr) faqs.push({ q: `What is the price of ${a.name.toLowerCase()} in Pakistan today?`, a: `${formatPkr(a.pricePkr)} on average across ${a.cityPrices.length} cities this week, from the Pakistan Bureau of Statistics weekly price survey.` })
    const sorted = [...a.cityPrices].sort((x, y) => x.avg - y.avg)
    if (sorted.length > 1) faqs.push({ q: `Where is ${a.name.toLowerCase()} cheapest?`, a: `${sorted[0]!.city} (${formatPkr(Math.round(sorted[0]!.avg))} average) and most expensive in ${sorted[sorted.length - 1]!.city} (${formatPkr(Math.round(sorted[sorted.length - 1]!.avg))}).` })
    for (const city of ['Lahore', 'Karachi', 'Islamabad']) {
      const c = a.cityPrices.find((x) => x.city.toLowerCase() === city.toLowerCase())
      if (c) faqs.push({ q: `What is the ${a.name.toLowerCase()} price in ${city}?`, a: `${formatPkr(Math.round(c.avg))} on average${c.min && c.max && c.min !== c.max ? ` (from ${formatPkr(Math.round(c.min))} to ${formatPkr(Math.round(c.max))} in different markets)` : ''} this week.` })
    }
    return faqs
  }
  if (a.category.group === 'vehicles' && a.brand.kind === 'maker') {
    if (a.pricePkr) faqs.push({ q: `What is the price of ${full} in Pakistan?`, a: `The official ex-factory price is ${formatPkr(a.pricePkr)}${a.priceUpdatedAt ? `, as listed by ${a.brand.name} Pakistan on ${new Date(a.priceUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })}` : ''}. Registration, taxes and freight are extra.` })
    faqs.push({ q: `Where can I book the ${full}?`, a: `At an authorised ${a.brand.name} dealership. The button on this page opens ${a.brand.name} Pakistan's own website with the current price list.` })
    return faqs
  }
  if (a.pricePkr) faqs.push({ q: `What is the price of ${full} in Pakistan?`, a: `${formatPkr(a.pricePkr)} on the official ${a.brand.name} store${a.priceUpdatedAt ? `, checked on ${new Date(a.priceUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })}` : ''}.` })
  faqs.push({ q: `Where can I buy the ${full}?`, a: `From the official ${a.brand.name} Pakistan store; the button on this page opens the product page. Authorised dealers may charge a different price.` })
  return faqs
}
