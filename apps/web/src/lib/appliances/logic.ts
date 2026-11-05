import { APPLIANCE_BRANDS, APPLIANCE_CATEGORIES, formatPkr } from '@zaviya/shared'

/** An appliance as the pages use it (plain data) */
export interface ApplianceView {
  id: string | number
  slug: string
  name: string
  model?: string
  brand: { slug: string; name: string }
  category: { slug: string; name: string; singular: string; ur: string }
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

export function categorySummaries(all: ApplianceView[]): CategorySummary[] {
  return APPLIANCE_CATEGORIES.map((category) => {
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
  const priced = all.filter(applianceIndexable).sort((x, y) => y.popularity - x.popularity)
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
  const rows = [{ label: 'Price in Pakistan', a: priceText(a), b: priceText(b) }, { label: 'Brand', a: a.brand.name, b: b.brand.name }]
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
    return `${cheap.brand.name} ${cheap.name} is ${formatPkr(dear.pricePkr! - cheap.pricePkr!)} cheaper than ${dear.brand.name} ${dear.name} at the brands' official prices.`
  }
  return `Both are listed in ${a.category.name.toLowerCase()} on the brands' official Pakistan stores; compare the specs below.`
}

/** Our own short summary when the editor wrote none */
export function applianceSummary(a: ApplianceView): string {
  if (a.summary) return a.summary
  const bits = a.specs.slice(0, 3).map((s) => `${s.label.toLowerCase()} ${s.value}`)
  const price = a.pricePkr ? `costs ${formatPkr(a.pricePkr)} on the official ${a.brand.name} store` : `is listed on the official ${a.brand.name} store without a price`
  return `The ${a.brand.name} ${a.name} ${price}.${bits.length ? ` Key specs: ${bits.join(', ')}.` : ''}`
}

// ---------- FAQs (built only from the data we list) ----------

export interface Faq {
  q: string
  a: string
}

export function hubFaqs(total: number): Faq[] {
  return [
    {
      q: 'Where do these appliance prices come from?',
      a: "From each brand's own Pakistan online store, read every day. Every product page links to the official page where you can buy it. We never copy prices from shops or other websites.",
    },
    {
      q: 'Why is my brand not listed?',
      a: 'Some brands do not show prices on their own website, so we cannot list an official price for them. We add a brand as soon as its Pakistan store publishes prices.',
    },
    ...(total ? [{ q: 'How many appliances are listed?', a: `${total} models across ACs, fridges, washing machines, geysers, heaters, coolers and kitchen appliances, and the list grows as brands add products.` }] : []),
  ]
}

export function categoryFaqs(cat: { name: string; singular: string }, items: ApplianceView[], brandLabel?: string): Faq[] {
  const priced = sortByPrice(items.filter(applianceIndexable))
  const who = brandLabel ? `${brandLabel} ${cat.name.toLowerCase()}` : cat.name.toLowerCase()
  const faqs: Faq[] = []
  if (priced.length) {
    const lo = priced[0]!
    const hi = priced[priced.length - 1]!
    faqs.push({ q: `What is the price of ${who} in Pakistan?`, a: `On the brands' official stores, ${who} start at ${formatPkr(lo.pricePkr!)} (${lo.brand.name} ${lo.name})${hi !== lo ? ` and go up to ${formatPkr(hi.pricePkr!)} (${hi.brand.name} ${hi.name})` : ''}.` })
    faqs.push({ q: `Which is the cheapest ${cat.singular.toLowerCase()} listed?`, a: `${lo.brand.name} ${lo.name} at ${formatPkr(lo.pricePkr!)}, the lowest official price we found today.` })
  }
  faqs.push({ q: 'How often are prices updated?', a: 'Every day. When a brand changes a price we record the old and new price in the price history on the product page.' })
  return faqs
}

export function productFaqs(a: ApplianceView): Faq[] {
  const full = `${a.brand.name} ${a.name}`
  const faqs: Faq[] = []
  if (a.pricePkr) faqs.push({ q: `What is the price of ${full} in Pakistan?`, a: `${formatPkr(a.pricePkr)} on the official ${a.brand.name} store${a.priceUpdatedAt ? `, checked on ${new Date(a.priceUpdatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Karachi' })}` : ''}.` })
  faqs.push({ q: `Where can I buy the ${full}?`, a: `From the official ${a.brand.name} Pakistan store; the button on this page opens the product page. Authorised dealers may charge a different price.` })
  return faqs
}
