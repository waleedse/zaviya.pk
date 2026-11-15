import { z } from 'zod'
import { classifyAppliance } from './appliances'
import { slugify } from './phones'

/**
 * Store offers (15 Nov 2026, Waleed: "from where I can buy, this site is giving this, that site that").
 * One row per product listing in a Pakistani retail store that publishes its own public product feed
 * (Shopify /products.json, read with Zaviya's user agent and robots.txt). Never price-comparison sites
 * (PriceOye, Qeemat, WhatMobile) and never marketplaces that block our bot. The image is the store's own
 * listing image and is always shown with a link to that store's product page.
 */
export const RETAIL_STORES = [
  { slug: 'telemart', name: 'Telemart', base: 'https://www.telemart.pk', platform: 'shopify' },
  { slug: 'mistore', name: 'Mi Store Pakistan', base: 'https://mistore.pk', platform: 'shopify' },
  { slug: 'friendshome', name: 'Friends Home', base: 'https://www.friendshome.pk', platform: 'shopify' },
] as const satisfies readonly { slug: string; name: string; base: string; platform: 'shopify' }[]
export type RetailStoreSlug = (typeof RETAIL_STORES)[number]['slug']
export const RETAIL_STORE_SLUGS = RETAIL_STORES.map((s) => s.slug) as [RetailStoreSlug, ...RetailStoreSlug[]]

export const OFFER_GROUPS = [
  { slug: 'mobiles', name: 'Mobile phones' },
  { slug: 'tablets', name: 'Tablets' },
  { slug: 'laptops', name: 'Laptops' },
  { slug: 'smartwatches', name: 'Smart watches' },
  { slug: 'audio', name: 'Earbuds & headphones' },
  { slug: 'speakers', name: 'Speakers' },
  { slug: 'tvs', name: 'TVs' },
  { slug: 'accessories', name: 'Chargers & accessories' },
  { slug: 'home-appliances', name: 'Home appliances' },
  { slug: 'other', name: 'Other' },
] as const
export type OfferGroupSlug = (typeof OFFER_GROUPS)[number]['slug']
export const OFFER_GROUP_SLUGS = OFFER_GROUPS.map((g) => g.slug) as [OfferGroupSlug, ...OfferGroupSlug[]]

const PHONE_WORDS = /\b(iphone|galaxy [amsz]\d|galaxy (note|fold|flip)|redmi|poco|infinix|tecno|vivo|oppo|realme|honor|itel|nokia|pixel|xiaomi \d|oneplus|sparx|zte|motorola|moto [eg]\d)/i

/** Our group from the store's product type and title. Order matters: "Redmi Pad" is a tablet, "Redmi Watch" a watch. */
export function offerGroup(title: string, productType = ''): OfferGroupSlug {
  const t = `${productType} ${title}`
  if (/\b(cover|case|screen protector|tempered|glass protector|back skin)\b/i.test(t)) return 'accessories'
  if (/\b(power ?bank|charger|charging|cable|adapter|usb[- ]?c to|lightning|car mount|holder|stand)\b/i.test(t)) return 'accessories'
  if (/\b(laptop|notebook|macbook|chromebook)\b/i.test(t)) return 'laptops'
  if (/\b(tablet|ipad|galaxy tab|redmi pad|xiaomi pad|\bpad \d)/i.test(t)) return 'tablets'
  if (/\b(smart ?watch|smart ?band|\bwatch\b|\bband \d|fitness tracker)/i.test(t)) return 'smartwatches'
  if (/\b(ear ?buds|earphones?|headphones?|headset|airpods|\bbuds\b|tws|neckband)\b/i.test(t)) return 'audio'
  if (/\b(speaker|soundbar|sound bar)\b/i.test(t)) return 'speakers'
  if (/\b(led tv|smart tv|android tv|google tv|qled|oled tv|\btv\b|television)\b/i.test(t)) return 'tvs'
  if (/^(phone|phones|mobile|mobiles|smartphones?)$/i.test(productType.trim()) || (PHONE_WORDS.test(title) && /\b\d{1,2}\s?\+?\s?\d{0,4}\s?gb\b|\b\d{2,4}\s?gb\b/i.test(title))) return 'mobiles'
  if (classifyAppliance(title, productType)) return 'home-appliances'
  return 'other'
}

const url = z.string().url().max(500)
export const OfferImportItemSchema = z.object({
  store: z.enum(RETAIL_STORE_SLUGS),
  /** Store-local id: the Shopify handle */
  handle: z.string().min(1).max(200),
  title: z.string().min(2).max(200),
  brand: z.string().max(60).optional(),
  group: z.enum(OFFER_GROUP_SLUGS),
  url,
  imageUrl: url.optional(),
  pricePkr: z.number().int().positive().max(50_000_000).nullable(),
  listPricePkr: z.number().int().positive().max(50_000_000).nullable().optional(),
  inStock: z.boolean().optional(),
  /** Appliance model code read from the title ("AG-2111"), used to match an appliance */
  model: z.string().max(80).optional(),
})
export type OfferImportItem = z.infer<typeof OfferImportItemSchema>
export const OfferImportBodySchema = z.object({ items: z.array(OfferImportItemSchema).min(1).max(250) })

export function offerSlug(store: string, handle: string): string {
  return `${store}-${slugify(handle)}`.slice(0, 180)
}

// ---------- matching an offer to one of our phone pages ----------

const NOISE = /\b(pta|approved|official|warranty|local|non|dual sim|single sim|5g|4g|lte|new|brand|box ?pack|pre ?booking|pre ?order|with|free|gift|edition|global|version|smartphone|mobile|phone)\b/gi
const COLOURS = /\b(black|white|blue|green|red|purple|pink|gold|silver|grey|gray|titanium|graphite|midnight|starlight|natural|desert|violet|yellow|orange|mint|cream|lavender|navy|bronze|aqua|cyan|ocean|sky|sunset|shadow|mist|frost|onyx|jade|ice|dark|light|deep|space)\b/gi
/** Words that make a different model: an "S25" offer is not the "S25 Ultra" and the reverse */
const QUALIFIERS = new Set(['ultra', 'plus', 'pro', 'max', 'lite', 'fe', 'mini', 'neo', 'edge', 'prime', 'turbo', 'note', 'fold', 'flip', 'air', 'power', 'play', 'go', 's', 'x', 'c', 'e', 't', 'i', 'r'])

export function modelTokens(text: string, brand = ''): string[] {
  let t = ` ${text.toLowerCase()} `
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\+/g, ' plus ')
    .replace(/\b\d{1,2}\s?gb\s?\/?\s?\d{2,4}\s?(gb|tb)\b/g, ' ')
    .replace(/\b\d{1,4}\s?(gb|tb)\b/g, ' ')
  if (brand) t = t.replace(new RegExp(`\\b${brand.toLowerCase().replace(/[^a-z0-9 ]/g, '')}\\b`, 'g'), ' ')
  t = t.replace(/\bapple\b|\bsamsung\b|\bxiaomi\b(?! \d)/g, ' ').replace(NOISE, ' ').replace(COLOURS, ' ')
  return t.split(/[^a-z0-9]+/).filter(Boolean)
}

export interface PhoneKey {
  slug: string
  brand: string
  name: string
}

/** The phone page this offer is for, or null. Every word of the phone's name must be in the offer, and the offer may not add a model word ("Ultra"). */
export function matchPhone(offer: { title: string; brand?: string }, phones: PhoneKey[]): string | null {
  const brand = (offer.brand ?? '').toLowerCase()
  let best: { slug: string; len: number } | null = null
  for (const p of phones) {
    const pb = p.brand.toLowerCase()
    const titleHasBrand = offer.title.toLowerCase().includes(pb) || (pb === 'apple' && /iphone/i.test(offer.title))
    if (brand && brand !== pb && !titleHasBrand) continue
    if (!brand && !titleHasBrand) continue
    const want = modelTokens(p.name, p.brand)
    if (!want.length) continue
    const have = modelTokens(offer.title, p.brand)
    // the phone's words must appear in order, side by side
    const at = have.findIndex((_, i) => want.every((w, j) => have[i + j] === w))
    if (at < 0) continue
    const extra = have.slice(at + want.length)
    if (extra.length && QUALIFIERS.has(extra[0]!)) continue
    if (at > 0 && have[at - 1] && /^[a-z]$/.test(have[at - 1]!)) continue
    if (!best || want.length > best.len) best = { slug: p.slug, len: want.length }
  }
  return best?.slug ?? null
}
