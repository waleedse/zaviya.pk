import { sql } from '@payloadcms/db-postgres'
import { ALL_CATEGORY_PATHS, PRODUCTS_INDEX, categoryName, categoryParent, categoryUrlPath, type ProductDoc } from '@zaviya/shared'
import { getPayloadClient } from '../payload'
import { meili, meiliConfigured } from './meili'

/**
 * The product category tree (prices hub, /prices/c/..., the category bar). One table, `product_categories`: every level of every path with
 * its product count, lowest price and the picture of its most popular product. The search sync refreshes it every 30 minutes from Meilisearch.
 */
export interface CategoryRow {
  path: string
  urlPath: string
  name: string
  parent: string | null
  level: number
  products: number
  minPrice: number | null
  imageUrl: string | null
}

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }
const rows = async (db: Db, q: ReturnType<typeof sql>) => ((await db.execute(q)) as { rows?: Record<string, any>[] }).rows ?? []

let lastRefresh = 0
/** Counts, lowest price and picture per category from the index; at most every 30 minutes unless forced */
export async function refreshCategories(db: Db, force = false): Promise<{ refreshed: number } | { skipped: true }> {
  if (!force && Date.now() - lastRefresh < 30 * 60_000) return { skipped: true }
  lastRefresh = Date.now()
  const facet = await meili<{ facetDistribution?: Record<string, Record<string, number>> }>('POST', `/indexes/${PRODUCTS_INDEX}/search`, { q: '', limit: 0, facets: ['category_path'] }, 10_000)
  const counts = facet.facetDistribution?.category_path ?? {}
  const paths = ALL_CATEGORY_PATHS.filter((p) => (counts[p] ?? 0) > 0)
  type Res = { results: { hits: Pick<ProductDoc, 'id' | 'image'>[]; facetStats?: Record<string, { min: number; max: number }> }[] }
  const out: { path: string; minPrice: number | null; image: string | null; imageId: string | null }[] = []
  for (let i = 0; i < paths.length; i += 40) {
    const chunk = paths.slice(i, i + 40)
    const r = await meili<Res>(
      'POST',
      '/multi-search',
      { queries: chunk.map((p) => ({ indexUid: PRODUCTS_INDEX, q: '', filter: [`category_path = "${p.replace(/"/g, '')}"`, 'in_stock_any = true'], sort: ['popularity:desc'], limit: 8, attributesToRetrieve: ['id', 'image'], facets: ['min_price'] })) },
      20_000,
    )
    chunk.forEach((p, j) => {
      const res = r.results[j]
      const withImage = res?.hits.find((h) => h.image)
      out.push({ path: p, minPrice: res?.facetStats?.min_price?.min ?? null, image: withImage?.image ?? null, imageId: withImage?.id ?? null })
    })
  }
  if (!out.length) return { refreshed: 0 }
  await db.execute(sql`INSERT INTO product_categories (path, url_path, name, parent, level, products, min_price, image_url, image_product_id, updated_at) VALUES ${sql.join(
    out.map((o) => sql`(${o.path}, ${categoryUrlPath(o.path)}, ${categoryName(o.path)}, ${categoryParent(o.path)}, ${o.path.split(' > ').length}, ${counts[o.path] ?? 0}, ${o.minPrice}::numeric, ${o.image}, ${o.imageId}, now())`),
    sql`, `,
  )} ON CONFLICT (path) DO UPDATE SET url_path = EXCLUDED.url_path, name = EXCLUDED.name, parent = EXCLUDED.parent, level = EXCLUDED.level, products = EXCLUDED.products,
      min_price = EXCLUDED.min_price, image_url = coalesce(EXCLUDED.image_url, product_categories.image_url), image_product_id = coalesce(EXCLUDED.image_product_id, product_categories.image_product_id), updated_at = now()`)
  // a path the rules no longer give, or with no products left, drops to 0 (kept, so an old link still resolves to a page that says so)
  await db.execute(sql`UPDATE product_categories SET products = 0, updated_at = now() WHERE path NOT IN (${sql.join(out.map((o) => sql`${o.path}`), sql`, `)})`)
  return { refreshed: out.length }
}

let cache: { at: number; rows: CategoryRow[] } | null = null
/** The whole tree, cached for 5 minutes in the web process. Empty before the first refresh. */
export async function getCategoryTree(): Promise<CategoryRow[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.rows
  try {
    const payload = await getPayloadClient()
    const r = await rows(payload.db.drizzle as unknown as Db, sql`SELECT path, url_path, name, parent, level, products, min_price, image_url FROM product_categories WHERE products > 0 ORDER BY level, products DESC`)
    const list = r.map((x) => ({ path: String(x.path), urlPath: String(x.url_path), name: String(x.name), parent: (x.parent as string | null) ?? null, level: Number(x.level), products: Number(x.products), minPrice: x.min_price == null ? null : Number(x.min_price), imageUrl: (x.image_url as string | null) ?? null }))
    if (!list.length) return await treeFromIndex()
    cache = { at: Date.now(), rows: list }
    return list
  } catch {
    return cache?.rows ?? []
  }
}

/** Before the table is filled (first minutes after a deploy): the same tree straight from the index counts, without pictures */
async function treeFromIndex(): Promise<CategoryRow[]> {
  const counts = await liveCategoryCounts()
  return ALL_CATEGORY_PATHS.filter((p) => (counts[p] ?? 0) > 0).map((path) => ({
    path, urlPath: categoryUrlPath(path), name: categoryName(path), parent: categoryParent(path), level: path.split(' > ').length, products: counts[path]!, minPrice: null, imageUrl: null,
  }))
}

export const childrenOf = (tree: CategoryRow[], parent: string | null) => tree.filter((c) => c.parent === parent).sort((a, b) => b.products - a.products)

/** Live counts straight from the index (used before the table is filled, and to show a category with no table row yet) */
export async function liveCategoryCounts(): Promise<Record<string, number>> {
  if (!meiliConfigured()) return {}
  try {
    const r = await meili<{ facetDistribution?: Record<string, Record<string, number>> }>('POST', `/indexes/${PRODUCTS_INDEX}/search`, { q: '', limit: 0, facets: ['category_path'] }, 3000)
    return r.facetDistribution?.category_path ?? {}
  } catch {
    return {}
  }
}
