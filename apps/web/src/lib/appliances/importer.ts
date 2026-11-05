import { applianceSlug, type ApplianceImportInput, type ApplianceSpec } from '@zaviya/shared'

/**
 * Importer core for appliances: merges one item read from a brand store into what is stored. Pure, tested on its own.
 *  - a price is only written from an item that carries one; "no price" never wipes a known price
 *  - every price change is recorded in priceHistory
 *  - a jump of more than MAX_JUMP in one step is not applied (store glitch guard) and reported as skipped
 *  - a "was" price that is not above the price, or more than 3x it, is ignored (Nasgas lists Rs500,000 "was" prices)
 *  - name, image, specs and summary only fill what is empty, so admin edits stay
 */

export const MAX_JUMP = 0.6

export interface StoredAppliance {
  name: string
  slug: string
  brand: string
  category: string
  model?: string | null
  hidden?: boolean | null
  popularity?: number | null
  imageUrl?: string | null
  officialUrl: string
  summary?: string | null
  pricePkr?: number | null
  listPricePkr?: number | null
  inStock?: boolean | null
  priceUpdatedAt?: string | null
  specs?: ApplianceSpec[] | null
  priceHistory?: { date: string; pricePkr: number; sourceUrl?: string | null }[] | null
}

export interface AppliancePriceChange {
  slug: string
  name: string
  from: number | null
  to: number
}

export interface ApplianceMergeResult {
  data: StoredAppliance
  created: boolean
  change: AppliancePriceChange | null
  skipped: { slug: string; from: number; to: number } | null
}

const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function sensibleListPrice(price: number | null | undefined, list: number | null | undefined): number | null {
  if (!price || !list) return null
  return list > price && list <= price * 3 ? list : null
}

export function mergeAppliance(existing: StoredAppliance | null, item: ApplianceImportInput, now: Date): ApplianceMergeResult {
  const slug = item.slug ?? applianceSlug(item.brand, item.name)
  const nowIso = now.toISOString()
  const data: StoredAppliance = existing
    ? { ...existing, priceHistory: [...(existing.priceHistory ?? [])] }
    : {
        name: item.name,
        slug,
        brand: item.brand,
        category: item.category,
        hidden: false,
        popularity: item.popularity ?? 0,
        officialUrl: item.officialUrl,
        priceHistory: [],
      }

  if (empty(data.model) && item.model) data.model = item.model
  if (empty(data.imageUrl) && item.imageUrl) data.imageUrl = item.imageUrl
  if (empty(data.specs) && item.specs?.length) data.specs = item.specs
  if ((empty(data.popularity) || data.popularity === 0) && item.popularity) data.popularity = item.popularity
  // The store URL can move; the newest one is the one that works
  data.officialUrl = item.officialUrl
  if (item.inStock !== undefined) data.inStock = item.inStock

  let change: AppliancePriceChange | null = null
  let skipped: ApplianceMergeResult['skipped'] = null
  const price = item.pricePkr ?? null
  if (price != null) {
    const old = data.pricePkr ?? null
    if (old != null && old !== price && Math.abs(price - old) / old > MAX_JUMP) {
      skipped = { slug, from: old, to: price }
    } else {
      if (old !== price) {
        change = { slug, name: data.name, from: old, to: price }
        data.priceHistory!.push({ date: nowIso, pricePkr: price, sourceUrl: item.officialUrl })
      }
      data.pricePkr = price
      data.listPricePkr = sensibleListPrice(price, item.listPricePkr)
      data.priceUpdatedAt = nowIso
    }
  }
  return { data, created: !existing, change, skipped }
}
