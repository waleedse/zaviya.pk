import { phoneSlug, variantLabel, type PhoneImportInput, type PhonePta, type PhoneSpecs } from '@zaviya/shared'
import { lowestPrice } from './logic'

/**
 * Importer core: merges one scraped/seed phone into what is stored. Pure (no Payload), so it is tested on its own.
 * Rules:
 *  - a price is only ever written from an item that carries one; "no price" never overwrites a known price
 *  - a price change is recorded in priceHistory (date, variant, price, source URL)
 *  - a price that jumps by more than MAX_JUMP in one step is NOT applied (scraper glitch guard) and is reported as skipped
 *  - specs, image, colours and the rest only fill what is empty, so edits made in the admin are never overwritten
 */

export const MAX_JUMP = 0.6

export interface StoredVariant {
  ramGb?: number | null
  storageGb: number
  pricePkr?: number | null
  priceSourceUrl?: string | null
  priceCheckedAt?: string | null
}

export interface StoredHistoryRow {
  date: string
  variant: string
  pricePkr: number
  sourceUrl?: string | null
}

/** The writable part of a `phones` document */
export interface StoredPhone {
  name: string
  slug: string
  brand: number | string
  launchDate?: string | null
  status?: 'current' | 'discontinued' | 'upcoming' | null
  hidden?: boolean | null
  popularity?: number | null
  imageUrl?: string | null
  officialUrl?: string | null
  summary?: string | null
  colours?: { name: string }[] | null
  variants?: StoredVariant[] | null
  pricePkr?: number | null
  priceUpdatedAt?: string | null
  priceHistory?: StoredHistoryRow[] | null
  pta?: Partial<PhonePta> | null
  specs?: Partial<PhoneSpecs> | null
  specsSourceUrl?: string | null
}

export interface PriceChange {
  slug: string
  name: string
  variant: string
  from: number | null
  to: number
}

export interface SkippedPrice {
  slug: string
  variant: string
  from: number
  to: number
  reason: string
}

export interface MergeResult {
  data: StoredPhone
  created: boolean
  changes: PriceChange[]
  skipped: SkippedPrice[]
}

const key = (v: { ramGb?: number | null; storageGb: number }) => `${v.ramGb ?? 0}-${v.storageGb}`
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

function fillEmpty<T extends object>(current: T | null | undefined, incoming: T | undefined): T | undefined {
  if (!incoming) return current ?? undefined
  const out = { ...(current ?? {}) } as Record<string, unknown>
  for (const [k, v] of Object.entries(incoming)) if (empty(out[k]) && !empty(v)) out[k] = v
  return out as T
}

export function mergePhone(
  existing: StoredPhone | null,
  item: PhoneImportInput,
  opts: { brandId: number | string; mode: 'seed' | 'prices'; now: Date },
): MergeResult {
  const slug = item.slug ?? phoneSlug(item.brand, item.name)
  const nowIso = opts.now.toISOString()
  const changes: PriceChange[] = []
  const skipped: SkippedPrice[] = []

  const data: StoredPhone = existing
    ? { ...existing, variants: (existing.variants ?? []).map((v) => ({ ...v })), priceHistory: [...(existing.priceHistory ?? [])] }
    : { name: item.name, slug, brand: opts.brandId, status: item.status ?? 'current', hidden: false, popularity: item.popularity ?? 0, variants: [], priceHistory: [] }

  // Fill-empty fields (never overwrite what an editor may have set)
  if (empty(data.launchDate) && item.launchDate) data.launchDate = item.launchDate.length === 7 ? `${item.launchDate}-01` : item.launchDate
  if (empty(data.imageUrl) && item.imageUrl) data.imageUrl = item.imageUrl
  if (empty(data.officialUrl) && item.officialUrl) data.officialUrl = item.officialUrl
  if (empty(data.specsSourceUrl) && item.specsSourceUrl) data.specsSourceUrl = item.specsSourceUrl
  if (empty(data.colours) && item.colours?.length) data.colours = item.colours.map((name) => ({ name }))
  if ((empty(data.popularity) || data.popularity === 0) && item.popularity) data.popularity = item.popularity
  if (item.pta) data.pta = fillEmpty(data.pta ?? undefined, item.pta)
  if (item.specs) data.specs = fillEmpty(data.specs ?? undefined, item.specs)
  // The brand's own status can move on sale -> discontinued, never back by itself
  if (existing && item.status === 'discontinued' && data.status === 'current') data.status = 'discontinued'

  const variants = data.variants!
  let seenPrice = false
  for (const inc of item.variants ?? []) {
    const label = variantLabel(inc)
    let cur = variants.find((v) => key(v) === key(inc))
    if (!cur) {
      cur = { ramGb: inc.ramGb ?? null, storageGb: inc.storageGb, pricePkr: null, priceSourceUrl: null, priceCheckedAt: null }
      variants.push(cur)
    }
    const price = inc.pricePkr ?? null
    if (price == null) continue
    seenPrice = true
    const old = cur.pricePkr ?? null
    if (old != null && old !== price && Math.abs(price - old) / old > MAX_JUMP) {
      skipped.push({ slug, variant: label, from: old, to: price, reason: `change of more than ${Math.round(MAX_JUMP * 100)}% in one step` })
      continue
    }
    if (old !== price) {
      changes.push({ slug, name: data.name, variant: label, from: old, to: price })
      data.priceHistory!.push({ date: nowIso, variant: label, pricePkr: price, sourceUrl: inc.priceSourceUrl ?? null })
    }
    cur.pricePkr = price
    cur.priceSourceUrl = inc.priceSourceUrl ?? cur.priceSourceUrl ?? null
    cur.priceCheckedAt = nowIso
  }
  variants.sort((a, b) => (a.storageGb ?? 0) - (b.storageGb ?? 0) || (a.ramGb ?? 0) - (b.ramGb ?? 0))

  data.pricePkr = lowestPrice(variants.map((v) => ({ pricePkr: v.pricePkr ?? null })))
  // An upcoming phone that gets an official price has launched
  if (seenPrice && data.status === 'upcoming' && data.pricePkr != null) data.status = 'current'
  if (seenPrice) data.priceUpdatedAt = nowIso
  return { data, created: !existing, changes, skipped }
}
