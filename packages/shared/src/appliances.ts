import { z } from 'zod'
import { slugify } from './phones'

/**
 * Home appliance prices (zaviya.pk/prices), added 5 Nov 2026.
 * Same rule as mobile prices: a price is only a number read from the brand's own Pakistan store or site;
 * every product links back to that official page ("Buy from the official store").
 * Shared by the web app (collection, pages, importer) and the worker (daily refresh).
 */

export const APPLIANCE_CATEGORIES = [
  { slug: 'air-conditioners', name: 'Air Conditioners', singular: 'AC', ur: 'اے سی', order: 1 },
  { slug: 'refrigerators', name: 'Refrigerators', singular: 'Refrigerator', ur: 'فریج', order: 2 },
  { slug: 'washing-machines', name: 'Washing Machines', singular: 'Washing Machine', ur: 'واشنگ مشین', order: 3 },
  { slug: 'water-heaters', name: 'Geysers & Water Heaters', singular: 'Geyser', ur: 'گیزر', order: 4 },
  { slug: 'room-heaters', name: 'Room Heaters', singular: 'Room Heater', ur: 'ہیٹر', order: 5 },
  { slug: 'air-coolers', name: 'Air Coolers', singular: 'Air Cooler', ur: 'ایئر کولر', order: 6 },
  { slug: 'water-dispensers', name: 'Water Dispensers & Coolers', singular: 'Water Dispenser', ur: 'واٹر ڈسپنسر', order: 7 },
  { slug: 'microwave-ovens', name: 'Microwave & Baking Ovens', singular: 'Oven', ur: 'اوون', order: 8 },
  { slug: 'cooking-ranges', name: 'Cooking Ranges, Hobs & Stoves', singular: 'Cooking Range', ur: 'چولہا', order: 9 },
  { slug: 'kitchen-hoods', name: 'Kitchen Hoods', singular: 'Kitchen Hood', ur: 'کچن ہڈ', order: 10 },
  { slug: 'dishwashers', name: 'Dishwashers', singular: 'Dishwasher', ur: 'ڈش واشر', order: 11 },
  { slug: 'air-fryers', name: 'Air Fryers', singular: 'Air Fryer', ur: 'ایئر فرائر', order: 12 },
  { slug: 'blenders', name: 'Blenders, Juicers & Choppers', singular: 'Blender', ur: 'بلینڈر', order: 13 },
  { slug: 'kettles', name: 'Electric Kettles', singular: 'Kettle', ur: 'کیتلی', order: 14 },
  { slug: 'irons', name: 'Irons', singular: 'Iron', ur: 'استری', order: 15 },
  { slug: 'fans', name: 'Fans', singular: 'Fan', ur: 'پنکھا', order: 16 },
  { slug: 'cookers', name: 'Rice & Pressure Cookers', singular: 'Cooker', ur: 'ککر', order: 17 },
  { slug: 'toasters-sandwich-makers', name: 'Toasters, Oven Toasters & Sandwich Makers', singular: 'Toaster', ur: 'ٹوسٹر', order: 18 },
] as const
export type ApplianceCategorySlug = (typeof APPLIANCE_CATEGORIES)[number]['slug']
export const APPLIANCE_CATEGORY_SLUGS = APPLIANCE_CATEGORIES.map((c) => c.slug) as [ApplianceCategorySlug, ...ApplianceCategorySlug[]]

export const APPLIANCE_BRANDS = [
  { slug: 'samsung', name: 'Samsung', site: 'https://www.samsung.com/pk/' },
  { slug: 'nasgas', name: 'Nasgas', site: 'https://www.nasgas.com/' },
  { slug: 'anex', name: 'Anex', site: 'https://www.anex.pk/' },
  { slug: 'westpoint', name: 'West Point', site: 'https://www.westpoint.pk/' },
] as const
export type ApplianceBrandSlug = (typeof APPLIANCE_BRANDS)[number]['slug']
export const APPLIANCE_BRAND_SLUGS = APPLIANCE_BRANDS.map((b) => b.slug) as [ApplianceBrandSlug, ...ApplianceBrandSlug[]]

/** Order matters: the first rule that matches wins ("water heater" before "heater", "rice cooker" before "cooker"). */
const RULES: [RegExp, ApplianceCategorySlug][] = [
  [/dish\s?washer/i, 'dishwashers'],
  [/air\s?fryer/i, 'air-fryers'],
  [/refrigerat|fridge|freezer/i, 'refrigerators'],
  [/washing machine|washer|dryer|spin/i, 'washing-machines'],
  [/geyser|water heater/i, 'water-heaters'],
  [/dispenser|dispender|water cooler/i, 'water-dispensers'],
  [/air cooler|room cooler|\bcooler\b/i, 'air-coolers'],
  [/air\s?condition|\binverter ac\b|\bsplit ac\b|wind-?free|\bac\b(?!\s*\/\s*dc)/i, 'air-conditioners'],
  [/microwave/i, 'microwave-ovens'],
  [/oven toaster|toaster oven/i, 'toasters-sandwich-makers'],
  [/\boven\b/i, 'microwave-ovens'],
  [/\bhood\b/i, 'kitchen-hoods'],
  [/cooking range|\bhob\b|gas stove|\bstove\b|hot\s?plate|infrared cooker|induction/i, 'cooking-ranges'],
  [/rice cooker|pressure cooker|slow cooker|multi cooker/i, 'cookers'],
  [/blender|juicer|grinder|chopper|food processor|mixer|citrus/i, 'blenders'],
  [/kettle/i, 'kettles'],
  [/\biron\b|steamer/i, 'irons'],
  [/heater/i, 'room-heaters'],
  [/\bfan\b/i, 'fans'],
  [/toaster|sandwich/i, 'toasters-sandwich-makers'],
]

/** Category from the product title and the store's own product type; null = not an appliance we list (beauty, accessories). */
export function classifyAppliance(title: string, productType = ''): ApplianceCategorySlug | null {
  const text = `${productType} ${title}`
  if (/straightener|epilator|trimmer|shaver|hair dryer|curler|groomer|insect killer|humidifier|spare|filter|remote|accessor/i.test(text)) return null
  for (const [re, cat] of RULES) if (re.test(text)) return cat
  return null
}

export function applianceSlug(brandSlug: string, name: string): string {
  const s = slugify(name)
  const b = slugify(brandSlug)
  return s.startsWith(`${b}-`) || s === b ? s : `${b}-${s}`
}

const url = z.string().url().max(500)

export const ApplianceSpecSchema = z.object({ label: z.string().min(1).max(60), value: z.string().min(1).max(200) })
export type ApplianceSpec = z.infer<typeof ApplianceSpecSchema>

export const ApplianceImportItemSchema = z.object({
  brand: z.enum(APPLIANCE_BRAND_SLUGS),
  category: z.enum(APPLIANCE_CATEGORY_SLUGS),
  name: z.string().min(2).max(160),
  /** Defaults to applianceSlug(brand, name) */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(140).optional(),
  model: z.string().max(80).optional(),
  /** Official PKR price; null = not shown by the brand */
  pricePkr: z.number().int().positive().max(5_000_000).nullable().optional(),
  /** The brand's own "was" price, when it shows one */
  listPricePkr: z.number().int().positive().max(5_000_000).nullable().optional(),
  inStock: z.boolean().optional(),
  imageUrl: url.optional(),
  /** The product page on the brand's own store: the "Buy" button */
  officialUrl: url,
  specs: z.array(ApplianceSpecSchema).max(20).optional(),
  popularity: z.number().int().min(0).max(100).optional(),
})
export type ApplianceImportItem = z.infer<typeof ApplianceImportItemSchema>
export type ApplianceImportInput = z.input<typeof ApplianceImportItemSchema>

export const ApplianceImportBodySchema = z.object({
  appliances: z.array(ApplianceImportItemSchema).min(1).max(200),
  observedAt: z.string().datetime().optional(),
})
export type ApplianceImportBody = z.infer<typeof ApplianceImportBodySchema>
