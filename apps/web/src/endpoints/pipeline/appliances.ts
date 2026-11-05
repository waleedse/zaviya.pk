import type { Endpoint, PayloadRequest } from 'payload'
import { ApplianceImportBodySchema, applianceSlug } from '@zaviya/shared'
import { json, parseJson, requireBotOrAdmin } from './helpers'
import { mergeAppliance, type AppliancePriceChange, type StoredAppliance } from '../../lib/appliances/importer'
import { revalidateAppliancePages } from '../../lib/revalidate'

const guard = (req: PayloadRequest) => requireBotOrAdmin(req)

const strip = <T extends { id?: unknown }>(rows: T[] | null | undefined) =>
  (rows ?? []).map((r) => {
    const { id: _id, ...rest } = r
    return rest
  })

const n = (v: unknown) => (v == null ? null : Number(v))

function docToStored(doc: Record<string, any>): StoredAppliance {
  return {
    name: doc.name,
    slug: doc.slug,
    brand: doc.brand,
    category: doc.category,
    model: doc.model ?? null,
    hidden: doc.hidden ?? false,
    popularity: n(doc.popularity) ?? 0,
    imageUrl: doc.imageUrl ?? null,
    officialUrl: doc.officialUrl,
    summary: doc.summary ?? null,
    pricePkr: n(doc.pricePkr),
    listPricePkr: n(doc.listPricePkr),
    inStock: doc.inStock ?? null,
    priceUpdatedAt: doc.priceUpdatedAt ?? null,
    specs: strip(doc.specs) as StoredAppliance['specs'],
    priceHistory: strip(doc.priceHistory).map((r: any) => ({ ...r, pricePkr: Number(r.pricePkr) })),
  }
}

export const applianceEndpoints: Endpoint[] = [
  {
    // Daily refresh from the brand stores. Idempotent: the same batch twice changes nothing.
    path: '/pipeline/appliances/import',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, ApplianceImportBodySchema)
      if ('error' in parsed) return parsed.error
      const now = parsed.data.observedAt ? new Date(parsed.data.observedAt) : new Date()
      const changes: AppliancePriceChange[] = []
      const skipped: unknown[] = []
      let created = 0
      let updated = 0
      for (const item of parsed.data.appliances) {
        const slug = item.slug ?? applianceSlug(item.brand, item.name)
        const found = await req.payload.find({ collection: 'appliances', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
        const existing = found.docs[0] ? docToStored(found.docs[0] as unknown as Record<string, any>) : null
        const merged = mergeAppliance(existing, { ...item, slug }, now)
        if (merged.change) changes.push(merged.change)
        if (merged.skipped) skipped.push(merged.skipped)
        if (merged.created) {
          await req.payload.create({ collection: 'appliances', data: merged.data as never, overrideAccess: true, context: { skipRevalidate: true } })
          created++
        } else {
          await req.payload.update({ collection: 'appliances', id: found.docs[0]!.id, data: merged.data as never, overrideAccess: true, context: { skipRevalidate: true } })
          updated++
        }
      }
      await revalidateAppliancePages()
      req.payload.logger.info({ created, updated, changes: changes.length, skipped: skipped.length }, 'appliances import')
      return json({ created, updated, changes, skipped })
    },
  },
]
