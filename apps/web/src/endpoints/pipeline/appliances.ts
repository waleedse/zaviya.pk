import type { Endpoint, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { APPLIANCE_BRANDS, APPLIANCE_CATEGORIES, ApplianceImportBodySchema, PriceDemandBodySchema, PriceHistoryBodySchema, applianceSlug } from '@zaviya/shared'
import { json, parseJson, requireBotOrAdmin } from './helpers'
import { mergeAppliance, mergeHistoryPoints, type AppliancePriceChange, type StoredAppliance } from '../../lib/appliances/importer'
import { hotScores, matchSearch, type DemandItem } from '../../lib/appliances/demand'
import { revalidateAppliancePages } from '../../lib/revalidate'
import { indexNowBatcher } from '../../hooks/indexNow'

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zaviya.pk').replace(/\/$/, '')
const brandNameOf = (slug: string) => APPLIANCE_BRANDS.find((b) => b.slug === slug)?.name ?? slug
const categoryNameOf = (slug: string) => APPLIANCE_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug

async function allItems(req: PayloadRequest): Promise<(DemandItem & { id: string | number; hotScore: number; pricePkr: number | null; priceUpdatedAt: string | null; brand: string })[]> {
  const res = await req.payload.find({ collection: 'appliances', where: { hidden: { not_equals: true } }, limit: 10_000, depth: 0, pagination: false, overrideAccess: true, select: { slug: true, name: true, brand: true, category: true, hotScore: true, pricePkr: true, priceUpdatedAt: true } as never })
  return (res.docs as unknown as Record<string, any>[]).map((d) => ({
    id: d.id,
    slug: String(d.slug),
    name: String(d.name),
    brand: String(d.brand),
    brandName: brandNameOf(String(d.brand)),
    categorySlug: String(d.category),
    categoryName: categoryNameOf(String(d.category)),
    hotScore: Number(d.hotScore ?? 0),
    pricePkr: d.pricePkr == null ? null : Number(d.pricePkr),
    priceUpdatedAt: d.priceUpdatedAt ?? null,
  }))
}

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
    nameUr: doc.nameUr ?? null,
    unit: doc.unit ?? null,
    cityPrices: strip(doc.cityPrices).map((r: any) => ({ city: r.city, avg: Number(r.avg), min: r.min == null ? null : Number(r.min), max: r.max == null ? null : Number(r.max) })),
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
      // new and re-priced pages go to IndexNow (Bing, Yandex and others) in one batch; Google reads the sitemap
      const announce = new Set<string>()
      let created = 0
      let updated = 0
      for (const item of parsed.data.appliances) {
        const slug = item.slug ?? applianceSlug(item.brand, item.name)
        const found = await req.payload.find({ collection: 'appliances', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
        const existing = found.docs[0] ? docToStored(found.docs[0] as unknown as Record<string, any>) : null
        const merged = mergeAppliance(existing, { ...item, slug }, now)
        if (merged.change) changes.push(merged.change)
        if (merged.skipped) skipped.push(merged.skipped)
        if ((merged.created || merged.change) && merged.data.pricePkr) {
          announce.add(`${siteUrl()}/prices/${merged.data.category}/${slug}`)
          announce.add(`${siteUrl()}/prices/${merged.data.category}`)
        }
        if (merged.created) {
          await req.payload.create({ collection: 'appliances', data: merged.data as never, overrideAccess: true, context: { skipRevalidate: true } })
          created++
        } else {
          await req.payload.update({ collection: 'appliances', id: found.docs[0]!.id, data: merged.data as never, overrideAccess: true, context: { skipRevalidate: true } })
          updated++
        }
      }
      await revalidateAppliancePages()
      if (announce.size) {
        announce.add(`${siteUrl()}/prices`)
        indexNowBatcher.add([...announce])
      }
      req.payload.logger.info({ created, updated, changes: changes.length, skipped: skipped.length, indexNow: announce.size }, 'appliances import')
      return json({ created, updated, changes, skipped, announced: announce.size })
    },
  },
  {
    // Days already recorded in one item's history: the worker asks before it re-reads old PBS releases
    path: '/pipeline/appliances/history-days',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const slug = new URL(req.url ?? 'http://x').searchParams.get('slug') ?? ''
      const found = await req.payload.find({ collection: 'appliances', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
      const doc = found.docs[0] as unknown as { priceHistory?: { date: string }[] } | undefined
      return json({ slug, days: (doc?.priceHistory ?? []).map((h) => String(h.date).slice(0, 10)).sort() })
    },
  },
  {
    // Backfill of price history from an official archive (PBS weekly releases, source_url per point).
    // Adds missing points only: never changes the current price, never removes a point. Idempotent.
    path: '/pipeline/appliances/history',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, PriceHistoryBodySchema)
      if ('error' in parsed) return parsed.error
      const bySlug = new Map<string, typeof parsed.data.points>()
      for (const p of parsed.data.points) bySlug.set(p.slug, [...(bySlug.get(p.slug) ?? []), p])
      let added = 0
      let items = 0
      const unknown: string[] = []
      for (const [slug, points] of bySlug) {
        const found = await req.payload.find({ collection: 'appliances', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
        if (!found.docs[0]) {
          unknown.push(slug)
          continue
        }
        const stored = docToStored(found.docs[0] as unknown as Record<string, any>)
        const merged = mergeHistoryPoints(stored.priceHistory, points.map((p) => ({ date: p.date, pricePkr: p.pricePkr, sourceUrl: p.sourceUrl })))
        if (!merged.added) continue
        await req.payload.update({ collection: 'appliances', id: found.docs[0].id, data: { priceHistory: merged.history } as never, overrideAccess: true, context: { skipRevalidate: true } })
        added += merged.added
        items++
      }
      if (added) await revalidateAppliancePages()
      req.payload.logger.info({ added, items, unknown: unknown.length }, 'appliances history backfill')
      return json({ added, items, unknown })
    },
  },
  {
    // Monthly from the research agent: what Pakistan searches for prices. Upserts by query; never deletes.
    path: '/pipeline/prices/demand',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, PriceDemandBodySchema)
      if ('error' in parsed) return parsed.error
      let created = 0
      let updated = 0
      for (const it of parsed.data.items) {
        const query = it.query.toLowerCase().replace(/\s+/g, ' ').trim()
        const found = await req.payload.find({ collection: 'price-demand', where: { query: { equals: query } }, limit: 1, depth: 0, overrideAccess: true })
        const data = { query, category: it.category, priority: it.priority, origin: it.origin, sourceHint: it.sourceHint, note: it.note }
        if (found.docs[0]) {
          await req.payload.update({ collection: 'price-demand', id: found.docs[0].id, data: data as never, overrideAccess: true })
          updated++
        } else {
          await req.payload.create({ collection: 'price-demand', data: data as never, overrideAccess: true })
          created++
        }
      }
      return json({ created, updated })
    },
  },
  {
    // Daily (worker, after the price refresh): hotScore = 10 x unique visitors in 7 days + strongest matching search.
    path: '/pipeline/prices/hot',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const items = await allItems(req)
      const rows = ((await req.payload.db.drizzle.execute(
        sql`SELECT path, count(DISTINCT visitor) AS uv FROM zaviya_pageviews WHERE ts >= now() - interval '7 days' AND path LIKE '/prices/%/%' GROUP BY path`,
      )) as unknown as { rows?: { path: string; uv: string }[] }).rows ?? []
      const visitors = new Map<string, number>()
      for (const r of rows) {
        const slug = r.path.split('/')[3]
        if (slug) visitors.set(slug, (visitors.get(slug) ?? 0) + Number(r.uv))
      }
      const demand = (await req.payload.find({ collection: 'price-demand', limit: 2000, depth: 0, pagination: false, overrideAccess: true })).docs as unknown as { id: string | number; query: string; priority: number; matched?: number; matchedSlugs?: string }[]
      const { scores, matches } = hotScores(items, visitors, demand.map((d) => ({ query: d.query, priority: Number(d.priority) })))
      let changed = 0
      for (const it of items) {
        const score = scores.get(it.slug) ?? 0
        if (score === it.hotScore) continue
        await req.payload.update({ collection: 'appliances', id: it.id, data: { hotScore: score } as never, overrideAccess: true, context: { skipRevalidate: true } })
        changed++
      }
      for (const d of demand) {
        const slugs = matches.get(d.query) ?? []
        const text = slugs.slice(0, 20).join(', ')
        if (Number(d.matched ?? 0) === slugs.length && (d.matchedSlugs ?? '') === text) continue
        await req.payload.update({ collection: 'price-demand', id: d.id, data: { matched: slugs.length, matchedSlugs: text } as never, overrideAccess: true })
      }
      if (changed) await revalidateAppliancePages()
      const top = [...scores.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 15)
      return json({ items: items.length, changed, top, uncovered: demand.filter((d) => !(matches.get(d.query) ?? []).length).sort((a, b) => b.priority - a.priority).slice(0, 30).map((d) => ({ query: d.query, priority: d.priority })) })
    },
  },
  {
    // What is covered and what is not: the research agent's monthly to-do list, and stale sources
    path: '/pipeline/prices/coverage',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const items = await allItems(req)
      const demand = (await req.payload.find({ collection: 'price-demand', limit: 2000, depth: 0, pagination: false, overrideAccess: true })).docs as unknown as { query: string; priority: number; sourceHint?: string }[]
      const byCategory: Record<string, { items: number; priced: number }> = {}
      const byBrand: Record<string, { items: number; priced: number; newest: string | null }> = {}
      for (const it of items) {
        const c = (byCategory[it.categorySlug] ??= { items: 0, priced: 0 })
        c.items++
        if (it.pricePkr) c.priced++
        const b = (byBrand[it.brand] ??= { items: 0, priced: 0, newest: null })
        b.items++
        if (it.pricePkr) b.priced++
        if (it.priceUpdatedAt && (!b.newest || it.priceUpdatedAt > b.newest)) b.newest = it.priceUpdatedAt
      }
      const staleBefore = new Date(Date.now() - 10 * 86_400_000).toISOString()
      return json({
        items: items.length,
        byCategory,
        byBrand,
        staleBrands: Object.entries(byBrand).filter(([, b]) => !b.newest || b.newest < staleBefore).map(([k]) => k),
        demand: demand
          .map((d) => ({ query: d.query, priority: d.priority, sourceHint: d.sourceHint, matched: matchSearch(d.query, items).length }))
          .sort((a, b) => a.matched - b.matched || b.priority - a.priority),
      })
    },
  },
]
