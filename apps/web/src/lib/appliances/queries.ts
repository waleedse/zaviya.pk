import { cache } from 'react'
import { getPayloadClient } from '@/lib/payload'
import { brandKind, brandName, categoryBySlug, type ApplianceView } from './logic'

/**
 * Data access for /prices. As with phones: during `next build` the table may not exist yet (the migration runs on boot),
 * so a failed read gives an empty list then; at runtime it throws, so ISR keeps the last good page.
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

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export function toApplianceView(doc: Record<string, any>): ApplianceView | null {
  const cat = categoryBySlug(String(doc.category))
  if (!cat || !str(doc.officialUrl)) return null
  return {
    id: doc.id,
    slug: String(doc.slug),
    name: String(doc.name),
    nameUr: str(doc.nameUr),
    model: str(doc.model),
    unit: str(doc.unit),
    brand: { slug: String(doc.brand), name: brandName(String(doc.brand)), kind: brandKind(String(doc.brand)) },
    category: { slug: cat.slug, name: cat.name, singular: cat.singular, ur: cat.ur, group: cat.group },
    cityPrices: ((doc.cityPrices ?? []) as Record<string, any>[])
      .map((r) => ({ city: String(r.city), avg: num(r.avg) ?? 0, min: num(r.min), max: num(r.max) }))
      .filter((r) => r.avg > 0),
    hotScore: num(doc.hotScore) ?? 0,
    pricePkr: num(doc.pricePkr),
    listPricePkr: num(doc.listPricePkr),
    inStock: typeof doc.inStock === 'boolean' ? doc.inStock : null,
    priceUpdatedAt: str(doc.priceUpdatedAt),
    imageUrl: str(doc.imageUrl),
    officialUrl: String(doc.officialUrl),
    summary: str(doc.summary),
    specs: ((doc.specs ?? []) as { label?: string; value?: string }[])
      .filter((s) => str(s.label) && str(s.value))
      .map((s) => ({ label: s.label!.trim(), value: s.value!.trim() })),
    priceHistory: ((doc.priceHistory ?? []) as Record<string, any>[])
      .map((r) => ({ date: String(r.date), pricePkr: num(r.pricePkr) ?? 0, sourceUrl: str(r.sourceUrl) }))
      .filter((r) => r.pricePkr > 0)
      .sort((a, b) => b.date.localeCompare(a.date)),
    popularity: num(doc.popularity) ?? 0,
    updatedAt: str(doc.updatedAt),
  }
}

/** All visible appliances (a few hundred rows: one query, pages filter in memory) */
export const getAppliances = cache(async (): Promise<ApplianceView[]> =>
  safe(async () => {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'appliances',
      where: { hidden: { not_equals: true } },
      limit: 5000,
      depth: 0,
      pagination: false,
      sort: '-popularity',
    })
    return res.docs.map((d) => toApplianceView(d as unknown as Record<string, any>)).filter((a): a is ApplianceView => a !== null)
  }, []),
)

export async function getApplianceBySlug(slug: string): Promise<ApplianceView | null> {
  return (await getAppliances()).find((a) => a.slug === slug) ?? null
}
