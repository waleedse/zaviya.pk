import type { Endpoint, Payload, PayloadRequest } from 'payload'
import { PHONE_BRANDS, PhoneImportBodySchema, phoneSlug } from '@zaviya/shared'
import { json, parseJson, requireBotOrAdmin } from './helpers'
import { mergePhone, type PriceChange, type SkippedPrice, type StoredPhone } from '../../lib/phones/importer'
import { recentPriceChanges } from '../../lib/phones/logic'
import { toPhoneView } from '../../lib/phones/queries'
import { revalidatePhonePages } from '../../lib/revalidate'
import type { BrandView } from '../../lib/phones/types'

const guard = (req: PayloadRequest) => requireBotOrAdmin(req)

const strip = <T extends { id?: unknown }>(rows: T[] | null | undefined) => (rows ?? []).map((r) => {
  const { id: _id, ...rest } = r
  return rest
})

/** Payload doc -> the writable StoredPhone (ids of array rows dropped: Payload makes new ones) */
function docToStored(doc: Record<string, any>): StoredPhone {
  return {
    name: doc.name,
    slug: doc.slug,
    brand: typeof doc.brand === 'object' && doc.brand ? doc.brand.id : doc.brand,
    launchDate: doc.launchDate ?? null,
    status: doc.status ?? 'current',
    hidden: doc.hidden ?? false,
    popularity: doc.popularity ?? 0,
    imageUrl: doc.imageUrl ?? null,
    officialUrl: doc.officialUrl ?? null,
    summary: doc.summary ?? null,
    colours: strip(doc.colours) as { name: string }[],
    variants: strip(doc.variants).map((v: any) => ({ ...v, ramGb: v.ramGb == null ? null : Number(v.ramGb), storageGb: Number(v.storageGb), pricePkr: v.pricePkr == null ? null : Number(v.pricePkr) })),
    pricePkr: doc.pricePkr == null ? null : Number(doc.pricePkr),
    priceUpdatedAt: doc.priceUpdatedAt ?? null,
    priceHistory: strip(doc.priceHistory).map((r: any) => ({ ...r, pricePkr: Number(r.pricePkr) })),
    pta: doc.pta ?? null,
    specs: doc.specs ?? null,
    specsSourceUrl: doc.specsSourceUrl ?? null,
  }
}

async function ensureBrands(payload: Payload, slugs: Set<string>): Promise<Map<string, number | string>> {
  const out = new Map<string, number | string>()
  for (const slug of slugs) {
    const found = await payload.find({ collection: 'phone-brands', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
    if (found.docs[0]) {
      out.set(slug, found.docs[0].id)
      continue
    }
    const def = PHONE_BRANDS.find((b) => b.slug === slug)!
    const made = await payload.create({ collection: 'phone-brands', data: { name: def.name, slug, order: def.order, officialSite: def.site }, overrideAccess: true })
    out.set(slug, made.id)
  }
  return out
}

export const phoneEndpoints: Endpoint[] = [
  {
    // First load and the daily price refresh. Idempotent: the same batch twice changes nothing.
    path: '/pipeline/phones/import',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, PhoneImportBodySchema)
      if ('error' in parsed) return parsed.error
      const { phones, mode = 'prices' } = parsed.data
      const now = parsed.data.observedAt ? new Date(parsed.data.observedAt) : new Date()
      const brandIds = await ensureBrands(req.payload, new Set(phones.map((p) => p.brand)))

      const changes: PriceChange[] = []
      const skipped: SkippedPrice[] = []
      let created = 0
      let updated = 0
      for (const item of phones) {
        const slug = item.slug ?? phoneSlug(item.brand, item.name)
        const found = await req.payload.find({ collection: 'phones', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
        const existing = found.docs[0] ? docToStored(found.docs[0] as unknown as Record<string, any>) : null
        const merged = mergePhone(existing, { ...item, slug }, { brandId: brandIds.get(item.brand)!, mode, now })
        changes.push(...merged.changes)
        skipped.push(...merged.skipped)
        const data = merged.data as unknown as Record<string, unknown>
        if (merged.created) {
          await req.payload.create({ collection: 'phones', data: data as never, overrideAccess: true })
          created++
        } else {
          await req.payload.update({ collection: 'phones', id: found.docs[0]!.id, data: data as never, overrideAccess: true })
          updated++
        }
      }
      await revalidatePhonePages()
      req.payload.logger.info({ mode, created, updated, changes: changes.length, skipped: skipped.length }, 'phones import')
      return json({ created, updated, changes, skipped })
    },
  },
  {
    // Recent official price changes (the news pipeline can turn them into short items)
    path: '/pipeline/phones/price-changes',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const days = Math.min(60, Math.max(1, Number(new URL(req.url!).searchParams.get('days') ?? 7) || 7))
      const brands = await req.payload.find({ collection: 'phone-brands', limit: 100, depth: 0, pagination: false, overrideAccess: true })
      const map = new Map<string, BrandView>(brands.docs.map((b) => [String(b.id), { id: b.id, slug: b.slug, name: b.name, order: Number(b.order ?? 100) }]))
      const res = await req.payload.find({ collection: 'phones', where: { hidden: { not_equals: true } }, limit: 2000, depth: 0, pagination: false, overrideAccess: true })
      const views = res.docs.map((d) => toPhoneView(d as unknown as Record<string, any>, map)).filter((p) => p !== null)
      const changes = recentPriceChanges(views, new Date(), days).map((c) => ({ slug: c.phone.slug, name: `${c.phone.brand.name} ${c.phone.name}`, from: c.from, to: c.to, date: c.date, url: `/mobile/${c.phone.slug}` }))
      return json({ changes })
    },
  },
]
