import { APPLIANCE_CATEGORIES } from '@zaviya/shared'
import { SEARCH_NAMES, searchName } from './searchNames'
import type { ApplianceView } from './logic'

/**
 * Price search (12 Nov 2026): "search any price you want". Pure functions over a small index of the items, so the API
 * route, the tests and any page can use them. Understands English, Roman Urdu ("anda", "cheeni", "gari") and Urdu script.
 */

/** Groups of words that mean the same thing for a shopper. Every word in a group expands to the whole group. */
const SYNONYM_GROUPS: string[][] = [
  ['egg', 'eggs', 'anda', 'ande', 'anday', 'انڈا', 'انڈے', 'انڈہ'],
  ['sugar', 'cheeni', 'chini', 'چینی'],
  ['atta', 'aata', 'flour', 'wheat', 'گندم', 'آٹا'],
  ['car', 'cars', 'gari', 'gaari', 'gadi', 'gaadi', 'گاڑی', 'گاڑیاں', 'vehicle'],
  ['bike', 'bikes', 'motorcycle', 'motorcycles', 'motorbike', 'موٹرسائیکل', 'موٹر', 'سائیکل'],
  ['milk', 'doodh', 'dudh', 'دودھ'],
  ['chicken', 'murghi', 'murgi', 'broiler', 'مرغی', 'چکن'],
  ['beef', 'gai', 'gaye', 'bara', 'گائے'],
  ['mutton', 'bakra', 'bakray', 'goat', 'بکرے', 'گوشت', 'gosht', 'meat'],
  ['ghee', 'ghi', 'گھی', 'dalda'],
  ['oil', 'tel', 'تیل', 'cooking'],
  ['daal', 'dal', 'dhal', 'دال', 'lentil', 'lentils', 'pulses'],
  ['rice', 'chawal', 'chaval', 'چاول', 'basmati'],
  ['potato', 'potatoes', 'aloo', 'alu', 'آلو'],
  ['onion', 'onions', 'pyaz', 'piyaz', 'پیاز'],
  ['tomato', 'tomatoes', 'tamatar', 'ٹماٹر'],
  ['garlic', 'lehsan', 'lahsan', 'لہسن'],
  ['lpg', 'cylinder', 'gas', 'سلنڈر', 'گیس'],
  ['fridge', 'refrigerator', 'refrigerators', 'freezer', 'فریج'],
  ['ac', 'airconditioner', 'conditioner', 'split', 'اے'],
  ['washing', 'washer', 'واشنگ'],
  ['geyser', 'gyser', 'gizer', 'heater', 'گیزر'],
  ['fan', 'fans', 'pankha', 'pankhay', 'پنکھا'],
  ['cooler', 'coolers'],
  ['oven', 'microwave', 'اوون'],
  ['stove', 'chulha', 'chula', 'range', 'hob', 'چولہا'],
  ['tea', 'chai', 'chay', 'چائے'],
  ['bread', 'roti', 'ڈبل', 'double'],
  ['petrol', 'diesel', 'پیٹرول'],
]

/** Words people add that carry no meaning for matching */
const STOP = new Set(['price', 'prices', 'rate', 'rates', 'in', 'pakistan', 'today', 'ka', 'ki', 'ke', 'ki', 'ka', 'kitne', 'kitna', 'ka', 'daam', 'qeemat', 'قیمت', 'ریٹ', 'کی', 'کا', 'کے', 'the', 'of', 'for', 'new', 'latest', 'per', 'online'])

/** Extra words for items whose official name is not what people type. Keyed by item slug. */
const ITEM_ALIASES: Record<string, string[]> = {
  'eggs-price': ['anda', 'ande', 'egg', 'dozen'],
  'sugar-price': ['cheeni', 'chini'],
  'atta-20kg-price': ['aata', 'flour', 'gandum', 'wheat flour', '20kg'],
  'live-chicken-price': ['murghi', 'chicken', 'broiler'],
  'fresh-milk-price': ['doodh', 'dudh'],
  'daal-chana-price': ['chana daal', 'chana dal'],
  'daal-masoor-price': ['masoor daal', 'masoor dal'],
  'daal-moong-price': ['moong daal', 'moong dal'],
  'daal-mash-price': ['mash daal', 'mash dal'],
  'lpg-cylinder-price': ['gas cylinder', 'lpg', 'cylinder', 'gas'],
  'tomato-price': ['tamatar'],
  'onion-price': ['pyaz', 'piyaz'],
  'potato-price': ['aloo'],
  'garlic-price': ['lehsan'],
  'ghee-1kg-price': ['ghi'],
  'ghee-2-5kg-price': ['ghi'],
  'mutton-price': ['bakra', 'gosht'],
  'beef-price': ['gai ka gosht', 'gosht'],
  'basmati-rice-price': ['chawal'],
  'irri-rice-price': ['chawal'],
  'tea-190g-price': ['chai', 'lipton'],
  'bread-price': ['roti', 'double roti'],
  'honda-cd-70': ['honda 70', 'cd70', 'cd 70', '70cc', 'bike 70'],
  'honda-cg-125': ['honda 125', 'cg125', '125cc'],
}

const SYNONYMS = new Map<string, string[]>()
for (const g of SYNONYM_GROUPS) for (const w of g) SYNONYMS.set(w, [...new Set([...(SYNONYMS.get(w) ?? []), ...g])])

const ARABIC_DIGITS = /[٠-٩۰-۹]/g
/** Lower case, Urdu digits to ASCII, no punctuation or diacritics, single spaces */
export function normalize(s: string): string {
  return s
    .replace(ARABIC_DIGITS, (d) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(d) % 10))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟ̀-ͯ]/g, '')
    .replace(/[^a-z0-9؀-ۿ.]+/g, ' ')
    .replace(/(\d)\.(?!\d)/g, '$1')
    .replace(/(^| )\.+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const tokens = (s: string): string[] => normalize(s).split(' ').filter(Boolean)

/** "20kg" and "20 kg" are the same thing */
function words(s: string): string[] {
  const t = tokens(s)
  const out: string[] = []
  for (const w of t) {
    const m = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(w)
    if (m) out.push(m[1]!, m[2]!, w)
    else out.push(w)
  }
  return out
}

export interface IndexItem {
  slug: string
  /** href of the item page */
  href: string
  name: string
  brand: string
  category: string
  categorySlug: string
  price: number | null
  unit?: string
  /** how the price is described: "average", "ex-factory", "official store" */
  kind: 'source' | 'maker' | 'store'
  rank: number
  /** words of the item itself: name, brand, model, aliases */
  words: Set<string>
  /** the item's words plus its category's: the second chance when no item names the search */
  looseWords: Set<string>
  nameWords: string[]
}

export interface IndexCategory {
  slug: string
  name: string
  ur: string
  href: string
  count: number
  minPrice: number | null
  words: Set<string>
  group: string
}

export interface SearchIndex {
  items: IndexItem[]
  categories: IndexCategory[]
}

export function buildSearchIndex(all: ApplianceView[]): SearchIndex {
  const items: IndexItem[] = all
    .filter((a) => a.pricePkr)
    .map((a) => {
      const alias = ITEM_ALIASES[a.slug] ?? []
      const sn = SEARCH_NAMES[a.slug]
      const text = [a.name, a.nameUr ?? '', a.brand.name, a.model ?? '', searchName(a), sn?.model ?? '', ...alias, a.slug.replace(/-/g, ' ')].join(' ')
      const ws = new Set(words(text))
      // expand the item's own words so "egg" finds "anda" and the reverse
      for (const w of [...ws]) for (const s of SYNONYMS.get(w) ?? []) ws.add(s)
      const loose = new Set(ws)
      for (const w of words(`${a.category.name} ${a.category.ur} ${a.category.singular}`)) {
        loose.add(w)
        for (const s of SYNONYMS.get(w) ?? []) loose.add(s)
      }
      return {
        slug: a.slug,
        href: `/prices/${a.category.slug}/${a.slug}`,
        name: a.brand.kind === 'source' ? a.name : a.name.toLowerCase().startsWith(a.brand.name.toLowerCase()) ? a.name : `${a.brand.name} ${a.name}`,
        brand: a.brand.name,
        category: a.category.name,
        categorySlug: a.category.slug,
        price: a.pricePkr,
        unit: a.unit,
        kind: a.brand.kind,
        rank: a.hotScore * 3 + a.popularity,
        words: ws,
        looseWords: loose,
        nameWords: words(`${a.name} ${a.brand.name} ${searchName(a)}`),
      }
    })
  const categories: IndexCategory[] = APPLIANCE_CATEGORIES.map((c) => {
    const inCat = items.filter((i) => i.categorySlug === c.slug)
    const prices = inCat.map((i) => i.price).filter((p): p is number => !!p)
    const ws = new Set(words([c.name, c.singular, c.ur, ...c.keywords.map((k) => k.replace(/ price.*/i, ''))].join(' ')))
    for (const w of [...ws]) for (const s of SYNONYMS.get(w) ?? []) ws.add(s)
    return { slug: c.slug, name: c.name, ur: c.ur, href: `/prices/${c.slug}`, count: inCat.length, minPrice: prices.length ? Math.min(...prices) : null, words: ws, group: c.group }
  }).filter((c) => c.count > 0)
  return { items, categories }
}

/** The words of a query, minus filler like "price" and "today", each with what it can also mean */
export function queryTerms(q: string): { word: string; alts: string[] }[] {
  const ws = words(q).filter((w) => !STOP.has(w))
  // keep the "20kg" glued form only when it has no split twin already, to avoid requiring both
  const seen = new Set<string>()
  const out: { word: string; alts: string[] }[] = []
  for (const w of ws) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push({ word: w, alts: SYNONYMS.get(w) ?? [] })
  }
  return out
}

const isNumber = (w: string) => /^\d+(\.\d+)?$/.test(w)

/** Does this word match one of the item's words? Numbers must match exactly; text matches as a prefix */
function hit(w: string, set: Set<string>, loose: boolean): boolean {
  if (set.has(w)) return true
  if (isNumber(w)) return false
  if (w.length < 2) return false
  for (const x of set) {
    if (isNumber(x)) continue
    if (x.startsWith(w) && (w.length >= 3 || x.length <= 4)) return true
    if (loose && w.length >= 4 && x.length >= 4 && within(w, x, w.length >= 7 ? 2 : 1)) return true
  }
  return false
}

/** Edit distance (insert, delete, replace, swap) at most `max`? */
export function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1)
      d[i]![j] = v
    }
  }
  return d[a.length]![b.length]! <= max
}

function matches(terms: ReturnType<typeof queryTerms>, set: Set<string>, loose: boolean): boolean {
  return terms.every((t) => hit(t.word, set, loose) || t.alts.some((a) => hit(a, set, false)))
}

/** Daily rate pages that answer price searches too */
export const RATE_PAGES: { href: string; name: string; words: Set<string> }[] = [
  { href: '/petrol-price-today-pakistan', name: 'Petrol and diesel price today', w: 'petrol diesel hsd fuel پیٹرول' },
  { href: '/gold-rate-today-pakistan', name: 'Gold rate today', w: 'gold sona sonay tola سونا' },
  { href: '/dollar-rate-today-pakistan', name: 'Dollar rate today', w: 'dollar usd ڈالر' },
  { href: '/riyal-dirham-rate-pakistan', name: 'Riyal and dirham rate', w: 'riyal dirham saudi uae ریال' },
  { href: '/chicken-price-pakistan', name: 'Chicken price today', w: 'chicken murghi broiler مرغی' },
  { href: '/mobile-prices', name: 'Mobile phone prices', w: 'mobile phone phones samsung vivo oppo realme iphone موبائل' },
].map((p) => ({ href: p.href, name: p.name, words: new Set(words(p.w)) }))

export interface SearchResult {
  items: IndexItem[]
  categories: IndexCategory[]
  pages: { href: string; name: string }[]
  /** total matching items before the limit */
  total: number
  /** true when the match needed typo tolerance */
  fuzzy: boolean
}

export function searchPrices(index: SearchIndex, query: string, limit = 8): SearchResult {
  const terms = queryTerms(query)
  if (!terms.length) return { items: [], categories: [], pages: [], total: 0, fuzzy: false }
  const run = (loose: boolean) => {
    const cats = index.categories.filter((c) => matches(terms, c.words, loose))
    let its = index.items.filter((i) => matches(terms, i.words, loose))
    // nothing names it: items whose category does ("fridge" finds every refrigerator, whatever its model code)
    if (!its.length) its = index.items.filter((i) => matches(terms, i.looseWords, loose))
    return { cats, its }
  }
  let { cats, its } = run(false)
  let fuzzy = false
  if (!its.length && !cats.length) {
    ;({ cats, its } = run(true))
    fuzzy = its.length > 0 || cats.length > 0
  }
  const first = terms[0]!
  const score = (i: IndexItem) => {
    let s = i.rank
    // the query words appear in the item's own name: stronger than a category or alias match
    const own = terms.filter((t) => i.nameWords.some((w) => w === t.word || (!isNumber(t.word) && w.startsWith(t.word)))).length
    s += own * 400
    if (i.nameWords[0] && (i.nameWords[0] === first.word || (!isNumber(first.word) && i.nameWords[0].startsWith(first.word)))) s += 300
    return s
  }
  const sorted = its.map((i) => ({ i, s: score(i) })).sort((a, b) => b.s - a.s || (a.i.price ?? 0) - (b.i.price ?? 0))
  return {
    items: sorted.slice(0, limit).map((x) => x.i),
    categories: cats.sort((a, b) => b.count - a.count).slice(0, 3),
    pages: RATE_PAGES.filter((p) => matches(terms, p.words, false)).map(({ href, name }) => ({ href, name })),
    total: its.length,
    fuzzy,
  }
}

/** When nothing matches: categories that are close in spelling to a word of the query, then the biggest ones */
export function closestCategories(index: SearchIndex, query: string, limit = 4): IndexCategory[] {
  const ws = words(query).filter((w) => !STOP.has(w) && !isNumber(w) && w.length >= 3)
  const scored = index.categories
    .map((c) => {
      let best = 99
      for (const w of ws) for (const x of c.words) if (!isNumber(x) && x.length >= 3) best = Math.min(best, within(w, x, 1) ? 1 : within(w, x, 2) ? 2 : 99)
      return { c, best }
    })
    .filter((x) => x.best < 99)
    .sort((a, b) => a.best - b.best || b.c.count - a.c.count)
    .map((x) => x.c)
  const popular = [...index.categories].sort((a, b) => b.count - a.count)
  return [...new Map([...scored, ...popular].map((c) => [c.slug, c])).values()].slice(0, limit)
}

/** What a stored query may look like: a short plain phrase, never a URL or an address */
export function cleanQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const q = raw.replace(/\s+/g, ' ').trim().toLowerCase()
  if (q.length < 3 || q.length > 60) return null
  if (/https?:|www\.|@|\.(com|pk|net|org)\b|<|>|\{|\}/.test(q)) return null
  if (!/[a-z؀-ۿ]{2}/.test(q)) return null
  return q
}
