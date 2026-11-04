import { z } from 'zod'

/**
 * Mobile prices and specs (zaviya.pk/mobile-prices).
 * Shared by the web app (collections, pages, importer) and the worker (daily price refresh).
 * Rule: a price is only ever a number we read from an official Pakistan source; otherwise it is null
 * and the site says "price not announced".
 */

export const PHONE_BRANDS = [
  { slug: 'samsung', name: 'Samsung', site: 'https://www.samsung.com/pk/', order: 1 },
  { slug: 'infinix', name: 'Infinix', site: 'https://www.infinixmobility.com/pk', order: 2 },
  { slug: 'tecno', name: 'Tecno', site: 'https://www.tecno-mobile.com/pk/', order: 3 },
  { slug: 'xiaomi', name: 'Xiaomi', site: 'https://www.mi.com/pk/', order: 4 },
  { slug: 'redmi', name: 'Redmi', site: 'https://www.mi.com/pk/', order: 5 },
  { slug: 'vivo', name: 'Vivo', site: 'https://www.vivo.com/pk', order: 6 },
  { slug: 'oppo', name: 'Oppo', site: 'https://www.oppo.com/pk/', order: 7 },
  { slug: 'realme', name: 'Realme', site: 'https://www.realme.com/pk/', order: 8 },
  { slug: 'apple', name: 'Apple', site: 'https://www.apple.com/', order: 9 },
] as const
export type PhoneBrandSlug = (typeof PHONE_BRANDS)[number]['slug']
export const PHONE_BRAND_SLUGS = PHONE_BRANDS.map((b) => b.slug) as [PhoneBrandSlug, ...PhoneBrandSlug[]]

/** "Phones under Rs X" lists (/mobile-prices/under-30000) */
export const PRICE_BANDS = [20000, 30000, 50000, 70000, 100000] as const
export type PriceBand = (typeof PRICE_BANDS)[number]

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Stable URL slug of a phone: the brand is part of the slug unless the name already starts with it ("Galaxy A17 5G" -> samsung-galaxy-a17-5g). */
export function phoneSlug(brandSlug: string, name: string): string {
  const s = slugify(name)
  const b = slugify(brandSlug)
  return s.startsWith(`${b}-`) || s === b ? s : `${b}-${s}`
}

/** "Rs 45,999" */
export function formatPkr(value: number): string {
  return `Rs ${Math.round(value).toLocaleString('en-US')}`
}

/** "8GB + 256GB" (RAM unknown: "256GB") */
export function variantLabel(v: { ramGb?: number | null; storageGb?: number | null }): string {
  const ram = v.ramGb ? `${v.ramGb}GB` : ''
  const sto = v.storageGb ? (v.storageGb >= 1024 && v.storageGb % 1024 === 0 ? `${v.storageGb / 1024}TB` : `${v.storageGb}GB`) : ''
  return ram && sto ? `${ram} + ${sto}` : ram || sto || 'Base model'
}

const url = z.string().url().max(500)

export const PhoneSpecsSchema = z.object({
  displaySize: z.string().max(60).optional(),
  displayType: z.string().max(120).optional(),
  displayResolution: z.string().max(60).optional(),
  refreshRateHz: z.number().int().positive().optional(),
  chipset: z.string().max(120).optional(),
  os: z.string().max(80).optional(),
  network: z.string().max(40).optional(),
  sim: z.string().max(120).optional(),
  rearCamera: z.string().max(300).optional(),
  frontCamera: z.string().max(120).optional(),
  batteryMah: z.number().int().positive().optional(),
  chargingW: z.number().positive().optional(),
  weightG: z.number().positive().optional(),
  dimensions: z.string().max(80).optional(),
  protection: z.string().max(160).optional(),
})
export type PhoneSpecs = z.infer<typeof PhoneSpecsSchema>

export const PhoneVariantInputSchema = z.object({
  ramGb: z.number().int().positive().nullable().optional(),
  /** 0 = the brand lists one price without memory options ("base model") */
  storageGb: z.number().int().nonnegative(),
  /** Official PKR price; null/absent = not announced */
  pricePkr: z.number().int().positive().max(5_000_000).nullable().optional(),
  priceSourceUrl: url.optional(),
})
export type PhoneVariantInput = z.infer<typeof PhoneVariantInputSchema>

export const PhonePtaSchema = z.object({
  status: z.enum(['approved', 'not-listed', 'unknown']),
  /** PTA/FBR tax on an imported unit, PKR, only when an official notification states it */
  taxPkr: z.number().int().positive().optional(),
  sourceUrl: url.optional(),
  note: z.string().max(300).optional(),
})
export type PhonePta = z.infer<typeof PhonePtaSchema>

export const PhoneImportItemSchema = z.object({
  brand: z.enum(PHONE_BRAND_SLUGS),
  name: z.string().min(2).max(120),
  /** Defaults to phoneSlug(brand, name) */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  /** ISO date (yyyy-mm-dd or yyyy-mm) */
  launchDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
  status: z.enum(['current', 'discontinued', 'upcoming']).optional(),
  imageUrl: url.optional(),
  officialUrl: url.optional(),
  /** Where the specs were read (manufacturer spec page) */
  specsSourceUrl: url.optional(),
  colours: z.array(z.string().min(1).max(40)).max(12).optional(),
  specs: PhoneSpecsSchema.optional(),
  variants: z.array(PhoneVariantInputSchema).max(12).default([]),
  pta: PhonePtaSchema.optional(),
  /** 0-100, higher = shown first and picked for compare pages */
  popularity: z.number().int().min(0).max(100).optional(),
})
export type PhoneImportItem = z.infer<typeof PhoneImportItemSchema>
/** What a caller sends (variants may be left out) */
export type PhoneImportInput = z.input<typeof PhoneImportItemSchema>

export const PhoneImportBodySchema = z.object({
  phones: z.array(PhoneImportItemSchema).min(1).max(100),
  /** 'seed' = first load (fills specs); 'prices' = daily refresh (prices only, never overwrites editor-edited specs) */
  mode: z.enum(['seed', 'prices']).default('prices'),
  /** When the prices were read; defaults to now */
  observedAt: z.string().datetime().optional(),
})
export type PhoneImportBody = z.infer<typeof PhoneImportBodySchema>
