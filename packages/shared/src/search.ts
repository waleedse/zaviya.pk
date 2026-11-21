/**
 * Product search (docs/PRODUCT-SEARCH.md): index settings, synonyms (English / Roman Urdu / Urdu script) and the key that
 * merges the same product sold by several stores into one search document.
 */

export const PRODUCTS_INDEX = 'products'

export interface ProductOffer {
  slug?: string
  store: string
  store_name: string
  price: number
  list_price: number | null
  in_stock: boolean
  url: string
  image: string | null
  updated_at: number
}

export interface ProductDoc {
  id: string
  title: string
  brand: string | null
  model: string | null
  group: string
  category_path: string[]
  image: string | null
  image_store: string | null
  offers: ProductOffer[]
  min_price: number
  max_price: number
  store_count: number
  stores: string[]
  in_stock_any: boolean
  match_kind: string | null
  match_slug: string | null
  price_drop_pct: number
  popularity: number
  updated_at: number
}

const SYNONYM_GROUPS: string[][] = [
  ['mobile', 'phone', 'smartphone', 'cellphone', 'موبائل', 'فون', 'fon'],
  ['glasses', 'chasma', 'chashma', 'spectacles', 'eyeglasses', 'sunglasses', 'عینک', 'چشمہ', 'aink'],
  ['spoon', 'chamach', 'chamcha', 'چمچ', 'چمچہ'],
  ['shoes', 'joota', 'jootay', 'جوتا', 'جوتے'],
  ['clothes', 'kapray', 'kapre', 'کپڑے'],
  ['laptop', 'notebook', 'لیپ ٹاپ'],
  ['atta', 'ata', 'flour', 'آٹا'],
  ['sugar', 'cheeni', 'چینی'],
  ['ghee', 'گھی'],
  ['rice', 'chawal', 'چاول'],
  ['oil', 'tel', 'تیل'],
  ['tea', 'chai', 'چائے'],
  ['milk', 'doodh', 'دودھ'],
  ['watch', 'ghari', 'گھڑی'],
  ['bag', 'bags', 'thaila', 'بیگ'],
  ['ac', 'air conditioner', 'airconditioner'],
  ['fridge', 'refrigerator', 'فریج'],
  ['tv', 'television', 'led tv', 'ٹی وی'],
  ['washing machine', 'washer', 'kapray dhone wali machine'],
  ['earbuds', 'earphones', 'airpods', 'ایئربڈز', 'headphones'],
  ['charger', 'adapter', 'چارجر'],
  ['cover', 'case', 'کور'],
  ['shirt', 'qameez', 'قمیض'],
  ['bike', 'motorcycle', 'motorbike', 'موٹر سائیکل'],
]

/** Every word maps to the others of its group (Meilisearch wants the two-way map spelled out) */
export function searchSynonyms(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const g of SYNONYM_GROUPS) for (const w of g) out[w] = g.filter((x) => x !== w)
  return out
}

export function productsIndexSettings() {
  return {
    searchableAttributes: ['title', 'brand', 'model', 'category_path', 'stores'],
    filterableAttributes: ['group', 'category_path', 'brand', 'stores', 'min_price', 'in_stock_any', 'store_count', 'price_drop_pct', 'updated_at'],
    sortableAttributes: ['min_price', 'popularity', 'updated_at', 'price_drop_pct', 'store_count'],
    // popularity right after words/typo (all query words must match first): the 'attribute' rule prefers a word at the start of the title, which put "iPhone 17 Handsfree" above "Apple iPhone 18 Pro". A phone (more stores, our own page, main category) outranks an accessory whose title also starts with the query
    rankingRules: ['words', 'typo', 'popularity:desc', 'proximity', 'attribute', 'exactness', 'store_count:desc'],
    typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
    synonyms: searchSynonyms(),
    pagination: { maxTotalHits: 2000 },
    displayedAttributes: ['*'],
  }
}

const alnum = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The same product at different stores shares a key: GTIN when known, else brand + model, else the listing stands alone.
 * Storage and colour variants stay separate products unless the model number already tells them apart.
 */
export function productKey(o: { slug: string; title?: string | null; brand?: string | null; model?: string | null; gtin?: string | null }): string {
  if (o.gtin && /^\d{8,14}$/.test(o.gtin)) return `gtin-${o.gtin}`
  const m = alnum(o.model)
  if (m.length >= 4 && /\d/.test(m)) return `m-${alnum(o.brand) || 'x'}-${m}`.slice(0, 120)
  // no code: the same words in any order (and the same size) at two stores are the same product
  const tokens = titleTokens(o.title)
  if (tokens.length >= 4) return `t-${tokens.join('')}`.slice(0, 160)
  return `s-${o.slug}`.slice(0, 160)
}

const TITLE_NOISE = new Set(['official', 'warranty', 'brand', 'new', 'original', 'free', 'delivery', 'with', 'and', 'the', 'for', 'of', 'in', 'a', 'pack', 'best', 'price', 'pakistan', 'online', 'buy', 'now', 'sale', 'offer', 'genuine', 'authentic'])

/** Sorted, de-duplicated words of a title without filler words ("Oud Perfume 100ml for men" and "100ml Perfume Oud - men" give the same list) */
export function titleTokens(title: string | null | undefined): string[] {
  const words = (title ?? '').toLowerCase().replace(/&amp;|&#\d+;/g, ' ').split(/[^a-z0-9]+/).filter((w) => w && !TITLE_NOISE.has(w))
  return [...new Set(words)].sort()
}

/** Meilisearch document ids allow letters, digits, - and _ */
export const docId = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 480)
