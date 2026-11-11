import { inflateRawSync } from 'node:zlib'
import { MAX_ITEM_PRICE_PKR, slugify, type ApplianceCategorySlug, type ApplianceImportInput, type CityPrice } from '@zaviya/shared'
import { ZAVIYA_USER_AGENT } from '../ingest/extract.js'
import { isAllowedByRobots } from '../ingest/robots.js'
import { decodeEntities } from '../phones/highlights.js'
import type { AdapterCtx } from '../phones/types.js'

/**
 * Price engine sources added 6 Nov 2026 (docs/PRICE-ENGINE.md). Each one is an official source, read once a day
 * with Zaviya's own user agent and robots.txt:
 *  - WooCommerce stores publish a public Store API (/wp-json/wc/store/v1/products): Atlas Honda (motorcycles)
 *  - Toyota Indus and Hyundai Nishat print their ex-factory price lists on their own home pages
 *  - Pakistan Bureau of Statistics publishes the weekly Sensitive Price Indicator (51 items, 17 cities) as XLSX
 */

const money = (v: unknown, min = 1): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n >= min && n <= MAX_ITEM_PRICE_PKR ? Math.round(n) : null
}

// ---------- WooCommerce Store API ----------

export interface WooStore {
  brand: 'honda'
  base: string
  /** Store category name (lower case) -> our category; products in other categories are skipped (spare parts, oil) */
  categories: Record<string, ApplianceCategorySlug>
  /** Colour words at the end of a product name are one model in several colours ("CD70 Red", "CD70 Black") */
  colours?: RegExp
}

export const WOO_STORES: WooStore[] = [
  {
    brand: 'honda',
    base: 'https://www.atlashonda.com.pk',
    categories: { motorcycles: 'motorcycles', ev: 'motorcycles' },
    colours: /\s*:?\s*\b(black|red|blue|silver|green|white|grey|gray)\b\s*$/i,
  },
]

interface WooProduct {
  name?: string
  permalink?: string
  prices?: { price?: string; regular_price?: string; currency_minor_unit?: number }
  categories?: { name?: string; slug?: string }[]
  images?: { src?: string }[]
  is_in_stock?: boolean
  short_description?: string
}

/** Honda model names as people search them: "CD70" -> "CD 70", "CG125S Gold" -> "CG 125S Gold", "ICON e" stays */
export function hondaModelName(name: string): string {
  return name.replace(/\b(CD|CG|CB|Pridor)\s?-?(\d{2,3})/gi, (_m, a: string, b: string) => `${a.toUpperCase() === 'PRIDOR' ? 'Pridor' : a.toUpperCase()} ${b}`).replace(/\s+/g, ' ').trim()
}

/** Groups colour variants into one model, cheapest price, colours listed as a spec */
export function parseWooProducts(products: WooProduct[], store: WooStore): ApplianceImportInput[] {
  const groups = new Map<string, { name: string; category: ApplianceCategorySlug; items: { price: number | null; url: string; image?: string; colour?: string; inStock: boolean }[]; order: number }>()
  products.forEach((p, i) => {
    const raw = decodeEntities(String(p.name ?? '')).replace(/\s+/g, ' ').trim()
    if (!raw || !p.permalink) return
    const cat = (p.categories ?? []).map((c) => store.categories[String(c.slug ?? c.name ?? '').toLowerCase()] ?? store.categories[String(c.name ?? '').toLowerCase()]).find(Boolean)
    if (!cat) return
    const colour = store.colours?.exec(raw)?.[1]
    const model = (store.colours ? raw.replace(store.colours, '') : raw).replace(/[:\s]+$/, '').trim()
    const minor = p.prices?.currency_minor_unit ?? 0
    const price = money(Number(p.prices?.price ?? NaN) / 10 ** minor, 1000)
    const key = slugify(model)
    const g = groups.get(key) ?? { name: hondaModelName(model), category: cat, items: [], order: i }
    g.items.push({ price, url: p.permalink, image: p.images?.[0]?.src, colour: colour ? colour[0]!.toUpperCase() + colour.slice(1).toLowerCase() : undefined, inStock: p.is_in_stock !== false })
    groups.set(key, g)
  })
  const out: ApplianceImportInput[] = []
  for (const g of groups.values()) {
    const priced = g.items.filter((x) => x.price != null).sort((a, b) => a.price! - b.price!)
    const best = priced[0] ?? g.items[0]!
    const colours = [...new Set(g.items.map((x) => x.colour).filter((c): c is string => Boolean(c)))]
    const prices = [...new Set(priced.map((x) => x.price!))]
    const specs = [
      ...(colours.length ? [{ label: 'Colours', value: colours.join(', ') }] : []),
      ...(prices.length > 1 ? [{ label: 'Price by colour', value: priced.map((x) => `${x.colour ?? 'Standard'} Rs ${x.price!.toLocaleString('en-US')}`).join(', ').slice(0, 200) }] : []),
      ...(/\bicon e\b|electric|\bev\b/i.test(g.name) ? [{ label: 'Type', value: 'Electric' }] : []),
      ...(/(\d{2,3})/.exec(g.name)?.[1] && !/icon/i.test(g.name) ? [{ label: 'Engine', value: `${/(\d{2,3})/.exec(g.name)![1]} cc` }] : []),
    ]
    out.push({
      brand: store.brand,
      category: g.category,
      name: g.name,
      model: g.name,
      pricePkr: best.price,
      inStock: g.items.some((x) => x.inStock),
      imageUrl: best.image?.startsWith('http') ? best.image : undefined,
      officialUrl: best.url,
      specs,
      unit: 'Retail price',
      // the store's own order: earlier = more prominent; the commuter bikes everyone searches get a lift
      popularity: Math.min(100, Math.max(20, 80 - g.order) + (/\b(CD 70|CG 125)\b/.test(g.name) ? 15 : 0)),
    })
  }
  return out
}

export async function fetchWoo(ctx: AdapterCtx, store: WooStore): Promise<ApplianceImportInput[]> {
  const products: WooProduct[] = []
  for (let page = 1; page <= 5; page++) {
    const body = await ctx.fetchText(`${store.base}/wp-json/wc/store/v1/products?per_page=100&page=${page}`)
    if (!body) {
      if (page === 1) throw new Error(`${store.brand} store API unavailable`)
      break
    }
    const batch = JSON.parse(body) as WooProduct[]
    if (!Array.isArray(batch)) break
    products.push(...batch)
    if (batch.length < 100) break
  }
  return parseWooProducts(products, store)
}

// ---------- Toyota Indus (price list in the home page script) ----------

export const TOYOTA_URL = 'https://toyota-indus.com/'

/** Readable variant names for the keys Toyota uses; an unknown key gets a best-effort name and a log line */
const TOYOTA_NAMES: Record<string, string> = {
  corollaMt16Price: 'Corolla 1.6 MT',
  corollaAt16Price: 'Corolla 1.6 AT',
  corollaAt16SePrice: 'Corolla 1.6 AT SE',
  altisCVTi18Price: 'Corolla Altis 1.8 CVT-i',
  altisGrandeCVTi18BeigeInteriorPrice: 'Corolla Altis Grande 1.8 CVT-i (Beige Interior)',
  altisGrandeCVTi18BlackInteriorPrice: 'Corolla Altis Grande 1.8 CVT-i (Black Interior)',
  altisGrandeCVTi18ChestnutInteriorPrice: 'Corolla Altis Grande 1.8 CVT-i (Chestnut Interior)',
  ToyotaYaris13lGliMtPrice: 'Yaris GLI 1.3 MT',
  ToyotaYaris13lGliCvtPrice: 'Yaris GLI 1.3 CVT',
  ToyotaYaris13lAtivMtPrice: 'Yaris ATIV 1.3 MT',
  ToyotaYaris13lAtivCvtPrice: 'Yaris ATIV 1.3 CVT',
  ToyotaYaris15lAtivXCvtBeigePrice: 'Yaris ATIV X 1.5 CVT (Beige)',
  ToyotaYaris15lAtivXCvtBlackPrice: 'Yaris ATIV X 1.5 CVT (Black)',
  PriusPrice: 'Prius',
  ToyotaCamryHybridHighGradePrice: 'Camry Hybrid High Grade',
  ToyotaCorollaCrossPremiumHybridPrice: 'Corolla Cross Premium Hybrid',
  ToyotaCorollaCrossSmartHybridPrice: 'Corolla Cross Smart Hybrid',
  ToyotaCorollaCrossHybridPrice: 'Corolla Cross Hybrid',
  ToyotaCorollaCrossGasolineXPrice: 'Corolla Cross Gasoline X',
  ToyotaCorollaCrossGasolinePrice: 'Corolla Cross Gasoline',
  ToyotaRushGAtPrice: 'Rush G AT',
  ToyotaRushGMtPrice: 'Rush G MT',
  FortunerG4x22trStdPetrolPrice: 'Fortuner G 4x2 2.7 Petrol',
  FortunerV4x42trHiPetrolPrice: 'Fortuner V 4x4 2.7 Petrol',
  FortunerSigma44x41gdHiDieselPrice: 'Fortuner Sigma 4 2.8 Diesel',
  FortunerLegender4x42755ccDieselPrice: 'Fortuner Legender 4x4 2.8 Diesel',
  Fortuner4x4GRSPrice: 'Fortuner GR-S 4x4',
  RevoGMtPrice: 'Hilux Revo G MT',
  RevoGAtPrice: 'Hilux Revo G AT',
  RevoVAtPrice: 'Hilux Revo V AT',
  RevoRoccoPrice: 'Hilux Revo Rocco',
  Revo4x4GRSPrice: 'Hilux Revo GR-S 4x4',
  HiluxEPrice: 'Hilux E',
  Hilux4x4Price: 'Hilux Single Cabin 4x4',
  Hilux4x2UPSPECPrice: 'Hilux Single Cabin 4x2 Up-Spec',
  Hilux4x2Price: 'Hilux Single Cabin 4x2',
  HiluxDecklessPrice: 'Hilux Deckless',
  ToyotaLandCruiserPrado28DieselSeater7Price: 'Land Cruiser Prado 2.8 Diesel 7-Seater',
  ToyotaLandCruiserPrado27PetrolSeater7Price: 'Land Cruiser Prado 2.7 Petrol 7-Seater',
  ToyotaLandCruiserPrado27PetrolSeater5Price: 'Land Cruiser Prado 2.7 Petrol 5-Seater',
  ToyotaLandCruiser300Price: 'Land Cruiser 300',
}

/** "ToyotaCorollaCrossGasolinePrice" -> "Corolla Cross Gasoline" for keys Toyota adds later */
export function toyotaKeyName(key: string): string {
  return TOYOTA_NAMES[key] ?? key.replace(/^Toyota/, '').replace(/Price$/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2').replace(/\s+/g, ' ').trim()
}

/** Popular models first: these are what people search ("corolla price", "yaris price") */
const TOYOTA_POP: [RegExp, number][] = [
  [/^Corolla \d|^Corolla Altis/, 85],
  [/^Yaris/, 85],
  [/^Corolla Cross/, 75],
  [/^Fortuner|^Hilux Revo/, 65],
]

export function parseToyota(html: string): ApplianceImportInput[] {
  const start = html.indexOf('let cars')
  if (start < 0) return []
  const block = html.slice(start, html.indexOf('};', start) + 2)
  const out: ApplianceImportInput[] = []
  for (const m of block.matchAll(/"(\w+Price)"\s*:\s*"([^"]*)"/g)) {
    const key = m[1]!
    const price = /^Rs/i.test(m[2]!.trim()) ? money(m[2], 500_000) : null
    // "Discontinued" and empty prices are left out; "Order Intake on Hold" is listed without a price
    if (price == null && !/on hold/i.test(m[2]!)) continue
    const name = toyotaKeyName(key)
    out.push({
      brand: 'toyota',
      category: 'cars',
      name,
      model: name,
      pricePkr: price,
      inStock: price != null,
      officialUrl: TOYOTA_URL,
      unit: 'Ex-factory price',
      specs: [{ label: 'Price type', value: 'Ex-factory (taxes, registration and freight extra)' }, ...(price == null ? [{ label: 'Bookings', value: 'Order intake on hold' }] : [])],
      popularity: TOYOTA_POP.find(([re]) => re.test(name))?.[1] ?? 45,
    })
  }
  return out
}

// ---------- Hyundai Nishat ("Model | From | PKR x" cards on the home page) ----------

export const HYUNDAI_URL = 'https://hyundai-nishat.com/'

export function parseHyundai(html: string): ApplianceImportInput[] {
  const out: ApplianceImportInput[] = []
  const seen = new Set<string>()
  for (const m of html.matchAll(/PKR\s?([0-9][0-9,]{5,})/g)) {
    const before = html.slice(Math.max(0, m.index! - 2500), m.index!)
    const link = [...before.matchAll(/href="(https:\/\/hyundai-nishat\.com\/[a-z0-9-]+\/)"/g)].pop()?.[1]
    const name = [...before.matchAll(/>\s*([^<>]{3,40}?)\s*</g)]
      .map((x) => decodeEntities(x[1]!).trim())
      .filter((t) => t && !/^from$/i.test(t))
      .pop()
    const price = money(m[1], 500_000)
    if (!name || !price || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const pretty = name === name.toUpperCase() ? name.replace(/\b([A-Z])([A-Z]+)\b/g, (_w, a: string, b: string) => (/^(IONIQ|HEV)$/.test(a + b) ? a + b : a + b.toLowerCase())) : name
    out.push({
      brand: 'hyundai',
      category: 'cars',
      name: pretty,
      model: pretty,
      pricePkr: price,
      officialUrl: link ?? HYUNDAI_URL,
      unit: 'Ex-factory price (from)',
      specs: [{ label: 'Price type', value: 'Starting ex-factory price (taxes, registration and freight extra)' }],
      popularity: /tucson|elantra|sonata/i.test(pretty) ? 65 : 45,
    })
  }
  return out
}

// ---------- PBS weekly Sensitive Price Indicator ----------

export const PBS_HOME = 'https://www.pbs.gov.pk/'

/** SPI item number -> our product. Items people do not shop for here (cigarettes, hotel plates, cloth, call charges) are left out. */
export const SPI_ITEMS: Record<number, { slug: string; name: string; ur: string; category: ApplianceCategorySlug; unit: string; popularity: number }> = {
  1: { slug: 'atta-20kg-price', name: 'Atta (Wheat Flour) 20 kg Bag', ur: 'آٹا 20 کلو تھیلا', category: 'atta-rice', unit: '20 kg bag', popularity: 100 },
  2: { slug: 'basmati-rice-price', name: 'Basmati Rice (Broken) 1 kg', ur: 'باسمتی چاول', category: 'atta-rice', unit: '1 kg', popularity: 60 },
  3: { slug: 'irri-rice-price', name: 'IRRI-6/9 Rice 1 kg', ur: 'اری چاول', category: 'atta-rice', unit: '1 kg', popularity: 45 },
  4: { slug: 'bread-price', name: 'Bread (Plain, Small)', ur: 'ڈبل روٹی', category: 'atta-rice', unit: 'Each', popularity: 40 },
  5: { slug: 'beef-price', name: 'Beef with Bone 1 kg', ur: 'گائے کا گوشت', category: 'meat-chicken-eggs', unit: '1 kg', popularity: 70 },
  6: { slug: 'mutton-price', name: 'Mutton 1 kg', ur: 'بکرے کا گوشت', category: 'meat-chicken-eggs', unit: '1 kg', popularity: 70 },
  7: { slug: 'live-chicken-price', name: 'Live Chicken (Farm Broiler) 1 kg', ur: 'زندہ مرغی', category: 'meat-chicken-eggs', unit: '1 kg', popularity: 90 },
  8: { slug: 'fresh-milk-price', name: 'Fresh Milk 1 Litre', ur: 'دودھ', category: 'milk-dairy', unit: '1 litre', popularity: 75 },
  9: { slug: 'dahi-price', name: 'Dahi (Yogurt) 1 kg', ur: 'دہی', category: 'milk-dairy', unit: '1 kg', popularity: 50 },
  10: { slug: 'nido-390g-price', name: 'Nido Powdered Milk 390 g', ur: 'نیڈو دودھ', category: 'milk-dairy', unit: '390 g pack', popularity: 40 },
  11: { slug: 'eggs-price', name: 'Eggs (Farm) per Dozen', ur: 'انڈے', category: 'meat-chicken-eggs', unit: '1 dozen', popularity: 85 },
  12: { slug: 'mustard-oil-price', name: 'Mustard Oil 1 kg', ur: 'سرسوں کا تیل', category: 'cooking-oil-ghee', unit: '1 kg', popularity: 40 },
  13: { slug: 'cooking-oil-5-litre-price', name: 'Cooking Oil 5 Litre Tin', ur: 'کوکنگ آئل 5 لیٹر', category: 'cooking-oil-ghee', unit: '5 litre tin', popularity: 75 },
  14: { slug: 'ghee-2-5kg-price', name: 'Vegetable Ghee 2.5 kg Tin', ur: 'گھی 2.5 کلو', category: 'cooking-oil-ghee', unit: '2.5 kg tin', popularity: 70 },
  15: { slug: 'ghee-1kg-price', name: 'Vegetable Ghee 1 kg Pouch', ur: 'گھی 1 کلو', category: 'cooking-oil-ghee', unit: '1 kg pouch', popularity: 75 },
  16: { slug: 'banana-price', name: 'Bananas per Dozen', ur: 'کیلے', category: 'vegetables-fruits', unit: '1 dozen', popularity: 40 },
  17: { slug: 'daal-masoor-price', name: 'Daal Masoor (Washed) 1 kg', ur: 'دال مسور', category: 'daal-pulses', unit: '1 kg', popularity: 55 },
  18: { slug: 'daal-moong-price', name: 'Daal Moong (Washed) 1 kg', ur: 'دال مونگ', category: 'daal-pulses', unit: '1 kg', popularity: 50 },
  19: { slug: 'daal-mash-price', name: 'Daal Mash (Washed) 1 kg', ur: 'دال ماش', category: 'daal-pulses', unit: '1 kg', popularity: 50 },
  20: { slug: 'daal-chana-price', name: 'Daal Chana (Gram) 1 kg', ur: 'دال چنا', category: 'daal-pulses', unit: '1 kg', popularity: 50 },
  21: { slug: 'potato-price', name: 'Potatoes 1 kg', ur: 'آلو', category: 'vegetables-fruits', unit: '1 kg', popularity: 55 },
  22: { slug: 'onion-price', name: 'Onions 1 kg', ur: 'پیاز', category: 'vegetables-fruits', unit: '1 kg', popularity: 65 },
  23: { slug: 'tomato-price', name: 'Tomatoes 1 kg', ur: 'ٹماٹر', category: 'vegetables-fruits', unit: '1 kg', popularity: 70 },
  24: { slug: 'sugar-price', name: 'Sugar 1 kg', ur: 'چینی', category: 'sugar-tea-spices', unit: '1 kg', popularity: 90 },
  25: { slug: 'gur-price', name: 'Gur (Jaggery) 1 kg', ur: 'گڑ', category: 'sugar-tea-spices', unit: '1 kg', popularity: 35 },
  26: { slug: 'salt-800g-price', name: 'Salt 800 g Packet', ur: 'نمک', category: 'sugar-tea-spices', unit: '800 g pack', popularity: 30 },
  27: { slug: 'red-chilli-powder-200g-price', name: 'Red Chilli Powder 200 g Packet', ur: 'لال مرچ پاؤڈر', category: 'sugar-tea-spices', unit: '200 g pack', popularity: 35 },
  28: { slug: 'garlic-price', name: 'Garlic (Lehsan) 1 kg', ur: 'لہسن', category: 'vegetables-fruits', unit: '1 kg', popularity: 45 },
  29: { slug: 'tea-190g-price', name: 'Tea (Lipton Yellow Label) 190 g', ur: 'چائے کی پتی', category: 'sugar-tea-spices', unit: '190 g pack', popularity: 45 },
  43: { slug: 'firewood-price', name: 'Firewood 40 kg (1 Maund)', ur: 'لکڑی ایک من', category: 'lpg-fuel-household', unit: '40 kg', popularity: 35 },
  45: { slug: 'washing-soap-price', name: 'Washing Soap (Sufi) 250 g', ur: 'کپڑے دھونے کا صابن', category: 'lpg-fuel-household', unit: '250 g cake', popularity: 25 },
  49: { slug: 'lpg-cylinder-price', name: 'LPG Cylinder 11.67 kg', ur: 'ایل پی جی سلنڈر', category: 'lpg-fuel-household', unit: '11.67 kg cylinder', popularity: 85 },
  51: { slug: 'lifebuoy-soap-price', name: 'Lifebuoy Soap 115 g', ur: 'لائف بوائے صابن', category: 'lpg-fuel-household', unit: '115 g', popularity: 25 },
}

/** Minimal XLSX reader: an .xlsx is a zip; we need the shared strings and the first sheet only */
export function unzipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  // end of central directory: signature 0x06054b50 within the last 64 KB
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(dataStart, dataStart + compSize)
    if (method === 0) out.set(name, Buffer.from(data))
    else if (method === 8) out.set(name, inflateRawSync(data))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const xmlText = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, ''))

/** Rows of the first sheet as { column letter: text } */
export function xlsxRows(buf: Buffer, sheet = 'xl/worksheets/sheet1.xml'): Record<string, string>[] {
  const files = unzipEntries(buf)
  const shared = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1]!))
  const xml = files.get(sheet)?.toString('utf8')
  if (!xml) throw new Error('sheet missing')
  const rows: Record<string, string>[] = []
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Record<string, string> = {}
    for (const c of r[1]!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const inner = c[3] ?? ''
      const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1]
      const inline = /<is>([\s\S]*?)<\/is>/.exec(inner)?.[1]
      if (v == null && inline == null) continue
      row[c[1]!] = /t="s"/.test(c[2]!) ? (shared[Number(v)] ?? '') : inline != null ? xmlText(inline) : v!
    }
    rows.push(row)
  }
  return rows
}

const colIndex = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
const colName = (i: number) => {
  let s = ''
  for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export interface SpiRelease {
  date: string | null
  items: { no: number; description: string; unit: string; cities: CityPrice[] }[]
}

/**
 * The annex sheet has blocks of 51 rows; each block starts with a header row naming 6-7 cities ("Lahore (05)"),
 * and every city takes three columns: MIN, AVG, MAX. Zero means "not collected in this city".
 */
export function parseSpiAnnex(rows: Record<string, string>[]): SpiRelease {
  let cityCols: { city: string; col: number }[] = []
  let date: string | null = null
  const items = new Map<number, SpiRelease['items'][number]>()
  for (const row of rows) {
    const cells = Object.entries(row)
    const cityHeaders = cells.filter(([, v]) => /^[A-Za-z .-]+\(\d{2}\)$/.test(v.trim()))
    if (cityHeaders.length) {
      cityCols = cityHeaders.map(([col, v]) => ({ city: v.replace(/\(\d{2}\)/, '').trim(), col: colIndex(col) }))
      continue
    }
    const d = cells.map(([, v]) => /PRICES ON (\d{2})-(\d{2})-(\d{4})/i.exec(v)).find(Boolean)
    if (d) date = `${d[3]}-${d[2]}-${d[1]}`
    const no = Number(row.A)
    if (!Number.isInteger(no) || no < 1 || no > 60 || !row.B || /^\d+$/.test(row.B)) continue
    const item = items.get(no) ?? { no, description: row.B.trim(), unit: (row.C ?? '').trim(), cities: [] }
    for (const { city, col } of cityCols) {
      const min = Number(row[colName(col)])
      const avg = Number(row[colName(col + 1)])
      const max = Number(row[colName(col + 2)])
      if (!(avg > 0) || item.cities.some((c) => c.city === city)) continue
      item.cities.push({ city, min: min > 0 ? Math.round(min * 100) / 100 : null, avg: Math.round(avg * 100) / 100, max: max > 0 ? Math.round(max * 100) / 100 : null })
    }
    items.set(no, item)
  }
  return { date, items: [...items.values()] }
}

/** National figure: the average of the city averages, rounded to the rupee */
export function nationalAverage(cities: CityPrice[]): number | null {
  const v = cities.map((c) => c.avg).filter((n) => n > 0)
  return v.length ? Math.max(1, Math.round(v.reduce((a, b) => a + b, 0) / v.length)) : null
}

export function spiToItems(release: SpiRelease, releaseUrl: string): ApplianceImportInput[] {
  const out: ApplianceImportInput[] = []
  for (const it of release.items) {
    const def = SPI_ITEMS[it.no]
    if (!def || it.cities.length < 3) continue
    const avg = nationalAverage(it.cities)
    if (!avg) continue
    const lows = it.cities.map((c) => c.min ?? c.avg)
    const highs = it.cities.map((c) => c.max ?? c.avg)
    out.push({
      brand: 'pbs',
      category: def.category,
      slug: def.slug,
      name: def.name,
      nameUr: def.ur,
      pricePkr: avg,
      officialUrl: releaseUrl,
      unit: def.unit,
      cityPrices: it.cities.sort((a, b) => a.city.localeCompare(b.city)),
      specs: [
        { label: 'Unit', value: def.unit },
        { label: 'Cities surveyed', value: String(it.cities.length) },
        { label: 'Lowest market price', value: `Rs ${Math.round(Math.min(...lows)).toLocaleString('en-US')}` },
        { label: 'Highest market price', value: `Rs ${Math.round(Math.max(...highs)).toLocaleString('en-US')}` },
        ...(release.date ? [{ label: 'Prices collected on', value: release.date }] : []),
      ],
      popularity: def.popularity,
      trusted: true,
    })
  }
  return out
}

/** Binary fetch with the same manners as ctx.fetchText */
export async function politeFetchBuffer(url: string): Promise<Buffer | null> {
  try {
    if (!(await isAllowedByRobots(url))) return null
    const res = await fetch(url, { headers: { 'User-Agent': ZAVIYA_USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null
  } catch {
    return null
  }
}

/** Newest "Weekly Sensitive Price Indicator" release linked from the PBS home page, and its annex XLSX */
export function latestSpiRelease(homeHtml: string): string | null {
  const links = [...homeHtml.matchAll(/href="(https:\/\/www\.pbs\.gov\.pk\/weekly-sensitive-price-indicator-spi-for-the-week-ended-on-(\d{2})-(\d{2})-(\d{4})\/)"/g)]
  if (!links.length) return null
  links.sort((a, b) => `${b[4]}${b[3]}${b[2]}`.localeCompare(`${a[4]}${a[3]}${a[2]}`))
  return links[0]![1]!
}

export async function fetchPbsSpi(ctx: AdapterCtx, fetchBuffer = politeFetchBuffer): Promise<ApplianceImportInput[]> {
  const home = await ctx.fetchText(PBS_HOME)
  const release = home ? latestSpiRelease(home) : null
  if (!release) throw new Error('PBS SPI release not found')
  const page = await ctx.fetchText(release)
  const annex = page && /href="([^"]+Annex[^"]*\.xlsx)"/i.exec(page)?.[1]
  if (!annex) throw new Error('PBS SPI annex not found')
  const buf = await fetchBuffer(annex)
  if (!buf) throw new Error('PBS SPI annex download failed')
  return spiToItems(parseSpiAnnex(xlsxRows(buf)), release)
}

export async function fetchToyota(ctx: AdapterCtx): Promise<ApplianceImportInput[]> {
  const html = await ctx.fetchText(TOYOTA_URL)
  if (!html) throw new Error('toyota price list unavailable')
  const items = parseToyota(html)
  if (!items.length) throw new Error('toyota price list not found in page')
  return items
}

export async function fetchHyundai(ctx: AdapterCtx): Promise<ApplianceImportInput[]> {
  const html = await ctx.fetchText(HYUNDAI_URL)
  if (!html) throw new Error('hyundai price list unavailable')
  const items = parseHyundai(html)
  if (!items.length) throw new Error('hyundai price list not found in page')
  return items
}

// ---------- PBS history: the weekly releases pbs.gov.pk still publishes ----------

export interface PbsRelease {
  url: string
  /** week-ended date, "2026-11-05" */
  date: string
}

/** Every "Weekly SPI for the week ended on D-M-YYYY" page named in a PBS sitemap (the site keeps only some weeks online) */
export function pbsReleasesFromSitemap(xml: string): PbsRelease[] {
  const out = new Map<string, PbsRelease>()
  for (const m of xml.matchAll(/<loc>(https:\/\/www\.pbs\.gov\.pk\/weekly-sensitive-price-indicator-spi-for-the-week-ended-on-(\d{1,2})-(\d{1,2})-(\d{4})\/)<\/loc>/g)) {
    const date = `${m[4]}-${m[3]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`
    out.set(date, { url: m[1]!, date })
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export interface PbsHistoryPoint {
  slug: string
  date: string
  pricePkr: number
  sourceUrl: string
}

/** One release's national average per item (the same figure the live price uses), dated with the day PBS collected it */
export function spiHistoryPoints(release: SpiRelease, releaseUrl: string, fallbackDate: string): PbsHistoryPoint[] {
  const day = release.date ?? fallbackDate
  const out: PbsHistoryPoint[] = []
  for (const it of release.items) {
    const def = SPI_ITEMS[it.no]
    if (!def || it.cities.length < 3) continue
    const avg = nationalAverage(it.cities)
    if (avg) out.push({ slug: def.slug, date: `${day}T00:00:00.000Z`, pricePkr: avg, sourceUrl: releaseUrl })
  }
  return out
}

const DAY_MS = 86_400_000
/** Releases whose week is not already within 3 days of a recorded day */
export function missingReleases(releases: PbsRelease[], recordedDays: string[]): PbsRelease[] {
  const have = recordedDays.map((d) => Date.parse(d)).filter(Number.isFinite)
  return releases.filter((r) => !have.some((t) => Math.abs(t - Date.parse(r.date)) <= 3 * DAY_MS))
}

export async function fetchPbsHistory(ctx: AdapterCtx, recordedDays: string[], max = 20, fetchBuffer = politeFetchBuffer): Promise<PbsHistoryPoint[]> {
  const sitemap = await ctx.fetchText('https://www.pbs.gov.pk/post-sitemap.xml')
  if (!sitemap) throw new Error('PBS sitemap unavailable')
  const todo = missingReleases(pbsReleasesFromSitemap(sitemap), recordedDays).slice(-max)
  const out: PbsHistoryPoint[] = []
  for (const rel of todo) {
    try {
      const page = await ctx.fetchText(rel.url)
      const annex = page && /href="([^"]+Annex[^"]*\.xlsx)"/i.exec(page)?.[1]
      const buf = annex ? await fetchBuffer(annex) : null
      if (!buf) continue
      out.push(...spiHistoryPoints(parseSpiAnnex(xlsxRows(buf)), rel.url, rel.date))
    } catch (e) {
      ctx.log({ release: rel.url, err: String(e) }, 'PBS history release failed')
    }
  }
  return out
}
