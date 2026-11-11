import { z } from 'zod'
import { slugify } from './phones'

/**
 * The price catalog behind zaviya.pk/prices (home appliances since 5 Nov 2026; vehicles and weekly grocery
 * prices since 6 Nov 2026, "price engine", docs/PRICE-ENGINE.md).
 * Rule for every item: the price is a number read from an official source, and the page links back to it:
 *  - a brand's own Pakistan store ("store": the Buy button opens the product there)
 *  - a maker's own price list ("maker": cars; the button opens the maker's page, you buy from a dealer)
 *  - a government statistics release ("source": PBS weekly prices; no Buy button, the source is cited)
 * Shared by the web app (collection, pages, importer) and the worker (daily refresh).
 * Brands and categories are stored as text, so adding one here needs no database migration.
 */

export const PRICE_GROUPS = [
  { slug: 'groceries', name: 'Grocery prices (weekly, official)', short: 'Groceries', ur: 'راشن کی قیمتیں', order: 1 },
  { slug: 'vehicles', name: 'Bikes and cars', short: 'Bikes & cars', ur: 'گاڑیاں اور موٹر سائیکل', order: 2 },
  { slug: 'appliances', name: 'Home appliances', short: 'Appliances', ur: 'گھریلو مصنوعات', order: 3 },
] as const
export type PriceGroupSlug = (typeof PRICE_GROUPS)[number]['slug']

/**
 * `keywords` are the searches the page is written for (title, description, H1 support text): the phrases people in
 * Pakistan type, e.g. "AC price in Pakistan", "atta price today". Keep the first one the main phrase.
 */
export const APPLIANCE_CATEGORIES = [
  // ---- home appliances (brand stores, daily)
  { slug: 'air-conditioners', group: 'appliances', name: 'Air Conditioners', singular: 'AC', ur: 'اے سی', order: 1, keywords: ['AC price in Pakistan', 'inverter AC price', '1.5 ton AC price'] },
  { slug: 'refrigerators', group: 'appliances', name: 'Refrigerators', singular: 'Refrigerator', ur: 'فریج', order: 2, keywords: ['fridge price in Pakistan', 'refrigerator price', 'inverter fridge price'] },
  { slug: 'washing-machines', group: 'appliances', name: 'Washing Machines', singular: 'Washing Machine', ur: 'واشنگ مشین', order: 3, keywords: ['washing machine price in Pakistan', 'automatic washing machine price'] },
  { slug: 'water-heaters', group: 'appliances', name: 'Geysers & Water Heaters', singular: 'Geyser', ur: 'گیزر', order: 4, keywords: ['geyser price in Pakistan', 'gas geyser price', 'instant geyser price'] },
  { slug: 'room-heaters', group: 'appliances', name: 'Room Heaters', singular: 'Room Heater', ur: 'ہیٹر', order: 5, keywords: ['gas heater price in Pakistan', 'electric heater price'] },
  { slug: 'air-coolers', group: 'appliances', name: 'Air Coolers', singular: 'Air Cooler', ur: 'ایئر کولر', order: 6, keywords: ['air cooler price in Pakistan', 'room cooler price'] },
  { slug: 'water-dispensers', group: 'appliances', name: 'Water Dispensers & Coolers', singular: 'Water Dispenser', ur: 'واٹر ڈسپنسر', order: 7, keywords: ['water dispenser price in Pakistan'] },
  { slug: 'microwave-ovens', group: 'appliances', name: 'Microwave & Baking Ovens', singular: 'Oven', ur: 'اوون', order: 8, keywords: ['microwave oven price in Pakistan', 'baking oven price'] },
  { slug: 'cooking-ranges', group: 'appliances', name: 'Cooking Ranges, Hobs & Stoves', singular: 'Cooking Range', ur: 'چولہا', order: 9, keywords: ['cooking range price in Pakistan', 'gas stove price'] },
  { slug: 'kitchen-hoods', group: 'appliances', name: 'Kitchen Hoods', singular: 'Kitchen Hood', ur: 'کچن ہڈ', order: 10, keywords: ['kitchen hood price in Pakistan'] },
  { slug: 'dishwashers', group: 'appliances', name: 'Dishwashers', singular: 'Dishwasher', ur: 'ڈش واشر', order: 11, keywords: ['dishwasher price in Pakistan'] },
  { slug: 'air-fryers', group: 'appliances', name: 'Air Fryers', singular: 'Air Fryer', ur: 'ایئر فرائر', order: 12, keywords: ['air fryer price in Pakistan'] },
  { slug: 'blenders', group: 'appliances', name: 'Blenders, Juicers & Choppers', singular: 'Blender', ur: 'بلینڈر', order: 13, keywords: ['blender price in Pakistan', 'juicer machine price'] },
  { slug: 'kettles', group: 'appliances', name: 'Electric Kettles', singular: 'Kettle', ur: 'کیتلی', order: 14, keywords: ['electric kettle price in Pakistan'] },
  { slug: 'irons', group: 'appliances', name: 'Irons', singular: 'Iron', ur: 'استری', order: 15, keywords: ['iron price in Pakistan', 'steam iron price'] },
  { slug: 'fans', group: 'appliances', name: 'Fans', singular: 'Fan', ur: 'پنکھا', order: 16, keywords: ['fan price in Pakistan', 'ceiling fan price', 'AC DC fan price'] },
  { slug: 'cookers', group: 'appliances', name: 'Rice & Pressure Cookers', singular: 'Cooker', ur: 'ککر', order: 17, keywords: ['rice cooker price in Pakistan'] },
  { slug: 'toasters-sandwich-makers', group: 'appliances', name: 'Toasters, Oven Toasters & Sandwich Makers', singular: 'Toaster', ur: 'ٹوسٹر', order: 18, keywords: ['sandwich maker price in Pakistan', 'toaster price'] },
  // ---- vehicles (makers' own price lists, daily)
  { slug: 'motorcycles', group: 'vehicles', name: 'Motorcycles & Electric Bikes', singular: 'Motorcycle', ur: 'موٹر سائیکل', order: 30, keywords: ['bike price in Pakistan', 'Honda bike price', 'CD 70 price', 'CG 125 price'] },
  { slug: 'cars', group: 'vehicles', name: 'Cars', singular: 'Car', ur: 'گاڑی', order: 31, keywords: ['car prices in Pakistan', 'new car price', 'Corolla price', 'Yaris price'] },
  // ---- groceries (PBS weekly Sensitive Price Indicator, 17 cities)
  { slug: 'atta-rice', group: 'groceries', name: 'Atta, Rice & Bread', singular: 'Staple', ur: 'آٹا اور چاول', order: 50, keywords: ['atta price today', '20 kg atta price', 'flour price in Pakistan', 'rice price'] },
  { slug: 'meat-chicken-eggs', group: 'groceries', name: 'Meat, Chicken & Eggs', singular: 'Item', ur: 'گوشت، مرغی اور انڈے', order: 51, keywords: ['chicken rate today', 'egg rate today', 'mutton price', 'beef price'] },
  { slug: 'milk-dairy', group: 'groceries', name: 'Milk & Dairy', singular: 'Item', ur: 'دودھ اور دہی', order: 52, keywords: ['milk price in Pakistan', 'doodh rate', 'dahi price'] },
  { slug: 'cooking-oil-ghee', group: 'groceries', name: 'Cooking Oil & Ghee', singular: 'Item', ur: 'گھی اور تیل', order: 53, keywords: ['ghee price today', 'cooking oil price in Pakistan', 'Dalda price'] },
  { slug: 'vegetables-fruits', group: 'groceries', name: 'Vegetables & Fruits', singular: 'Item', ur: 'سبزیاں اور پھل', order: 54, keywords: ['tomato price today', 'onion price', 'potato price', 'sabzi rates'] },
  { slug: 'daal-pulses', group: 'groceries', name: 'Daal (Pulses)', singular: 'Daal', ur: 'دالیں', order: 55, keywords: ['daal price in Pakistan', 'masoor daal price', 'chana daal price'] },
  { slug: 'sugar-tea-spices', group: 'groceries', name: 'Sugar, Tea, Salt & Spices', singular: 'Item', ur: 'چینی، چائے اور مصالحے', order: 56, keywords: ['sugar price today', 'cheeni rate', 'tea price'] },
  { slug: 'lpg-fuel-household', group: 'groceries', name: 'LPG, Firewood & Soap', singular: 'Item', ur: 'ایل پی جی اور گھریلو اشیا', order: 57, keywords: ['LPG cylinder price today', 'firewood price', 'soap price'] },
] as const satisfies readonly {
  slug: string
  group: PriceGroupSlug
  name: string
  singular: string
  ur: string
  order: number
  keywords: readonly string[]
}[]
export type ApplianceCategorySlug = (typeof APPLIANCE_CATEGORIES)[number]['slug']
export const APPLIANCE_CATEGORY_SLUGS = APPLIANCE_CATEGORIES.map((c) => c.slug) as [ApplianceCategorySlug, ...ApplianceCategorySlug[]]

/**
 * kind: "store" = the brand sells online (Buy button); "maker" = official price list, bought from dealers;
 * "source" = official statistics (no brand on the product, no Buy button).
 */
export const APPLIANCE_BRANDS = [
  { slug: 'samsung', name: 'Samsung', site: 'https://www.samsung.com/pk/', kind: 'store' },
  { slug: 'nasgas', name: 'Nasgas', site: 'https://www.nasgas.com/', kind: 'store' },
  { slug: 'anex', name: 'Anex', site: 'https://www.anex.pk/', kind: 'store' },
  { slug: 'westpoint', name: 'West Point', site: 'https://www.westpoint.pk/', kind: 'store' },
  { slug: 'gfc', name: 'GFC', site: 'https://gfcfans.com/', kind: 'store' },
  { slug: 'honda', name: 'Honda', site: 'https://www.atlashonda.com.pk/', kind: 'store' },
  { slug: 'toyota', name: 'Toyota', site: 'https://toyota-indus.com/', kind: 'maker' },
  { slug: 'hyundai', name: 'Hyundai', site: 'https://hyundai-nishat.com/', kind: 'maker' },
  { slug: 'pbs', name: 'Pakistan Bureau of Statistics', site: 'https://www.pbs.gov.pk/', kind: 'source' },
] as const satisfies readonly { slug: string; name: string; site: string; kind: 'store' | 'maker' | 'source' }[]
export type ApplianceBrandSlug = (typeof APPLIANCE_BRANDS)[number]['slug']
export const APPLIANCE_BRAND_SLUGS = APPLIANCE_BRANDS.map((b) => b.slug) as [ApplianceBrandSlug, ...ApplianceBrandSlug[]]
export type PriceSourceKind = (typeof APPLIANCE_BRANDS)[number]['kind']

/** Order matters: the first rule that matches wins ("water heater" before "heater", "rice cooker" before "cooker"). */
const RULES: [RegExp, ApplianceCategorySlug][] = [
  [/dish\s?washer/i, 'dishwashers'],
  [/air\s?fryer/i, 'air-fryers'],
  [/refrigerat|fridge|freezer/i, 'refrigerators'],
  [/washing machine|washer|dryer|spin/i, 'washing-machines'],
  [/geyser|water heater/i, 'water-heaters'],
  [/dispenser|dispender|water cooler/i, 'water-dispensers'],
  [/air cooler|room cooler|\bcooler\b/i, 'air-coolers'],
  [/fan heater/i, 'room-heaters'],
  [/\bhood\b/i, 'kitchen-hoods'],
  [/microwave/i, 'microwave-ovens'],
  [/oven toaster|toaster oven/i, 'toasters-sandwich-makers'],
  [/\boven\b/i, 'microwave-ovens'],
  [/cooking range|\bhob\b|gas stove|\bstove\b|hot\s?plate|infrared cooker|induction/i, 'cooking-ranges'],
  [/rice cooker|pressure cooker|slow cooker|multi cooker/i, 'cookers'],
  [/blender|juicer|grinder|chopper|food processor|mixer|citrus/i, 'blenders'],
  [/kettle/i, 'kettles'],
  [/\biron\b|steamer/i, 'irons'],
  // GFC sells "AC DC" and "AC/DC" ceiling fans: a fan is a fan before the AC rule sees "AC"
  [/\bfans?\b|pedestal|bracket|exhaust/i, 'fans'],
  [/air\s?condition|\binverter ac\b|\bsplit ac\b|wind-?free|\bac\b(?!\s*[\/&-]?\s*dc)/i, 'air-conditioners'],
  [/heater/i, 'room-heaters'],
  [/toaster|sandwich/i, 'toasters-sandwich-makers'],
]

/** Category from the product title and the store's own product type; null = not an appliance we list (beauty, accessories). */
export function classifyAppliance(title: string, productType = ''): ApplianceCategorySlug | null {
  const text = `${productType} ${title}`
  if (/straightener|epilator|trimmer|shaver|hair dryer|curler|groomer|insect killer|humidifier|spare|filter|remote|accessor|capacitor|regulator|blade|motor only|dimmer|battery|\blfp\b|solar panel|charger/i.test(text)) return null
  for (const [re, cat] of RULES) if (re.test(text)) return cat
  return null
}

export function applianceSlug(brandSlug: string, name: string): string {
  const s = slugify(name)
  const b = slugify(brandSlug)
  return s.startsWith(`${b}-`) || s === b ? s : `${b}-${s}`
}

const url = z.string().url().max(500)

/** Highest price we accept for one item (a Land Cruiser is about Rs 106 million) */
export const MAX_ITEM_PRICE_PKR = 250_000_000

export const ApplianceSpecSchema = z.object({ label: z.string().min(1).max(60), value: z.string().min(1).max(200) })
export type ApplianceSpec = z.infer<typeof ApplianceSpecSchema>

/** One city's prices in an official release (PBS: lowest, average and highest market price that week) */
export const CityPriceSchema = z.object({
  city: z.string().min(2).max(40),
  min: z.number().positive().max(MAX_ITEM_PRICE_PKR).nullable().optional(),
  avg: z.number().positive().max(MAX_ITEM_PRICE_PKR),
  max: z.number().positive().max(MAX_ITEM_PRICE_PKR).nullable().optional(),
})
export type CityPrice = z.infer<typeof CityPriceSchema>

export const ApplianceImportItemSchema = z.object({
  brand: z.enum(APPLIANCE_BRAND_SLUGS),
  category: z.enum(APPLIANCE_CATEGORY_SLUGS),
  name: z.string().min(2).max(160),
  /** Defaults to applianceSlug(brand, name) */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(140).optional(),
  model: z.string().max(80).optional(),
  /** Official PKR price; null = not shown by the brand */
  pricePkr: z.number().int().positive().max(MAX_ITEM_PRICE_PKR).nullable().optional(),
  /** The brand's own "was" price, when it shows one */
  listPricePkr: z.number().int().positive().max(MAX_ITEM_PRICE_PKR).nullable().optional(),
  inStock: z.boolean().optional(),
  imageUrl: url.optional(),
  /** The product page on the brand's own store, the maker's price page, or the official release */
  officialUrl: url,
  specs: z.array(ApplianceSpecSchema).max(20).optional(),
  popularity: z.number().int().min(0).max(100).optional(),
  /** What the price is for: "20 kg bag", "1 dozen", "ex-factory" */
  unit: z.string().max(40).optional(),
  /** Per-city prices from an official release; replaces what is stored */
  cityPrices: z.array(CityPriceSchema).max(40).optional(),
  /** Urdu name, shown next to the English one (groceries) */
  nameUr: z.string().max(80).optional(),
  /** Official statistics move a lot week to week (tomatoes): skip the store-glitch jump guard */
  trusted: z.boolean().optional(),
})
export type ApplianceImportItem = z.infer<typeof ApplianceImportItemSchema>
export type ApplianceImportInput = z.input<typeof ApplianceImportItemSchema>

export const ApplianceImportBodySchema = z.object({
  appliances: z.array(ApplianceImportItemSchema).min(1).max(200),
  observedAt: z.string().datetime().optional(),
})
export type ApplianceImportBody = z.infer<typeof ApplianceImportBodySchema>

// ---------- demand: what Pakistan searches for (research agent, monthly) ----------

export const PriceDemandItemSchema = z.object({
  /** The search as people type it: "honda cd 70 price", "atta 20 kg price lahore" */
  query: z.string().min(3).max(120),
  /** Our category it belongs to, when there is one */
  category: z.enum(APPLIANCE_CATEGORY_SLUGS).optional(),
  /** 1-100: how much this search matters (volume and trend, the researcher's estimate) */
  priority: z.number().int().min(1).max(100),
  /** Where the idea came from */
  origin: z.enum(['research', 'gsc', 'site-search', 'trends']).default('research'),
  /** Official site that could give the price, when the item is not covered yet */
  sourceHint: z.string().max(300).optional(),
  note: z.string().max(300).optional(),
})
export type PriceDemandItem = z.infer<typeof PriceDemandItemSchema>
export const PriceDemandBodySchema = z.object({ items: z.array(PriceDemandItemSchema).min(1).max(200) })

// ---------- history backfill from an official archive (PBS weekly releases) ----------

export const PriceHistoryPointSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(140),
  /** When the official source collected or published the price */
  date: z.string().datetime(),
  pricePkr: z.number().positive().max(MAX_ITEM_PRICE_PKR),
  /** The release page the price was read from */
  sourceUrl: url,
})
export type PriceHistoryPoint = z.infer<typeof PriceHistoryPointSchema>
export const PriceHistoryBodySchema = z.object({ points: z.array(PriceHistoryPointSchema).min(1).max(1000) })
