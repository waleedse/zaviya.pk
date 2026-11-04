import { cache } from 'react'
import { variantLabel, type PhonePta, type PhoneSpecs } from '@zaviya/shared'
import { getPayloadClient } from '@/lib/payload'
import { lowestPrice } from './logic'
import type { BrandView, PhoneView } from './types'

/**
 * Data access for the mobile pages. Every page gets plain PhoneView/BrandView objects.
 * `next build` pre-renders against a database that may not have the tables yet (the migration runs when the new
 * container boots), so during the build a failed read gives an empty list instead of failing the build.
 * At runtime a failed read throws, so ISR keeps serving the last good page instead of caching an empty one.
 */

const isBuild = () => process.env.NEXT_PHASE === 'phase-production-build'

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (isBuild()) return fallback
    throw err
  }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Drops empty values so `Object.keys(specs).length` means "specs we have" */
function cleanSpecs(raw: Record<string, unknown> | null | undefined): PhoneSpecs {
  const s: Record<string, unknown> = {}
  const text = ['displaySize', 'displayType', 'displayResolution', 'chipset', 'os', 'network', 'sim', 'rearCamera', 'frontCamera', 'dimensions', 'protection'] as const
  const numbers = ['refreshRateHz', 'batteryMah', 'chargingW', 'weightG'] as const
  for (const k of text) if (str(raw?.[k])) s[k] = str(raw?.[k])
  for (const k of numbers) if (num(raw?.[k])) s[k] = num(raw?.[k])
  return s as PhoneSpecs
}

/** Payload doc -> PhoneView (exported for tests) */
export function toPhoneView(doc: Record<string, any>, brands: Map<string, BrandView>): PhoneView | null {
  const brandId = typeof doc.brand === 'object' && doc.brand ? doc.brand.id : doc.brand
  const brand = brands.get(String(brandId))
  if (!brand) return null
  const variants = ((doc.variants ?? []) as Record<string, any>[])
    .map((v) => {
      const ramGb = num(v.ramGb) ?? null
      const storageGb = num(v.storageGb) ?? 0
      return { ramGb, storageGb, label: variantLabel({ ramGb, storageGb }), pricePkr: num(v.pricePkr) ?? null, sourceUrl: str(v.priceSourceUrl), checkedAt: str(v.priceCheckedAt) }
    })
    .sort((a, b) => a.storageGb - b.storageGb || (a.ramGb ?? 0) - (b.ramGb ?? 0))
  const pta = doc.pta && typeof doc.pta === 'object' ? ({ status: doc.pta.status ?? undefined, taxPkr: num(doc.pta.taxPkr), sourceUrl: str(doc.pta.sourceUrl), note: str(doc.pta.note) } as Partial<PhonePta>) : undefined
  return {
    id: doc.id,
    slug: String(doc.slug),
    name: String(doc.name),
    brand: { slug: brand.slug, name: brand.name },
    launchDate: str(doc.launchDate),
    status: doc.status === 'discontinued' || doc.status === 'upcoming' ? doc.status : 'current',
    imageUrl: str(doc.imageUrl),
    officialUrl: str(doc.officialUrl),
    summary: str(doc.summary),
    colours: ((doc.colours ?? []) as { name?: string }[]).map((c) => c.name).filter((n): n is string => !!n),
    variants,
    // Derived from the variants: a stale denormalised value can never show a price that no variant carries
    pricePkr: lowestPrice(variants),
    priceUpdatedAt: str(doc.priceUpdatedAt),
    priceHistory: ((doc.priceHistory ?? []) as Record<string, any>[])
      .map((r) => ({ date: String(r.date), variant: String(r.variant), pricePkr: num(r.pricePkr) ?? 0, sourceUrl: str(r.sourceUrl) }))
      .filter((r) => r.pricePkr > 0)
      .sort((a, b) => b.date.localeCompare(a.date)),
    pta,
    specs: cleanSpecs(doc.specs),
    specsSourceUrl: str(doc.specsSourceUrl),
    popularity: num(doc.popularity) ?? 0,
    updatedAt: str(doc.updatedAt),
  }
}

export const getBrands = cache(async (): Promise<BrandView[]> =>
  safe(async () => {
    const payload = await getPayloadClient()
    const res = await payload.find({ collection: 'phone-brands', limit: 100, depth: 0, sort: 'order', pagination: false })
    return res.docs.map((b) => ({ id: b.id, slug: b.slug, name: b.name, officialSite: b.officialSite ?? undefined, description: b.description ?? undefined, order: Number(b.order ?? 100) }))
  }, []),
)

/** All published phones (a few hundred rows: one query, then the pages filter in memory) */
export const getPhones = cache(async (): Promise<PhoneView[]> =>
  safe(async () => {
    const payload = await getPayloadClient()
    const brands = new Map((await getBrands()).map((b) => [String(b.id), b]))
    const res = await payload.find({
      collection: 'phones',
      where: { hidden: { not_equals: true } },
      limit: 2000,
      depth: 0,
      pagination: false,
      sort: '-popularity',
    })
    return res.docs.map((d) => toPhoneView(d as unknown as Record<string, any>, brands)).filter((p): p is PhoneView => p !== null)
  }, []),
)

export async function getPhoneBySlug(slug: string): Promise<PhoneView | null> {
  return (await getPhones()).find((p) => p.slug === slug) ?? null
}

export async function getBrandBySlug(slug: string): Promise<BrandView | null> {
  return (await getBrands()).find((b) => b.slug === slug) ?? null
}
