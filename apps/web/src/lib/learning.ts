import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { CATEGORIES } from '@zaviya/shared'
import { gscConfigured, gscQuery, isoDay } from './gsc'
import { siteUrl } from './seo'

/**
 * The feedback loop: what readers and Google respond to feeds back into
 * triage (category weights) and into headlines (title refresh).
 */

type Rows<T> = { rows: T[] }
const q = async <T>(payload: Payload, query: ReturnType<typeof sql>) =>
  (((await payload.db.drizzle.execute(query)) as unknown as Rows<T>).rows ?? [])

export const LEARNING_DDL = [
  sql`CREATE TABLE IF NOT EXISTS zaviya_learning (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

export async function getLearning<T>(payload: Payload, key: string): Promise<T | null> {
  const [row] = await q<{ value: T }>(payload, sql`SELECT value FROM zaviya_learning WHERE key = ${key}`)
  return row?.value ?? null
}

export async function setLearning(payload: Payload, key: string, value: unknown): Promise<void> {
  await payload.db.drizzle.execute(sql`
    INSERT INTO zaviya_learning (key, value, updated_at) VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
}

/** Publishing pace inputs for the triage rules. */
export async function pacingStats(payload: Payload): Promise<{ lastPublishedAt: string | null; articlesPublishedToday: number }> {
  const [row] = await q<{ last: string | null; today: string }>(
    payload,
    sql`SELECT to_json(max(published_at))#>>'{}' AS last,
      count(*) FILTER (WHERE published_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi')) AS today
      FROM articles WHERE _status = 'published' AND story_cluster_id IS NOT NULL`,
  )
  return { lastPublishedAt: row?.last ?? null, articlesPublishedToday: Number(row?.today ?? 0) }
}

/** Category multiplier from reader interest: sqrt(category avg views / overall avg), kept within 0.85–1.2. */
export async function computeCategoryWeights(payload: Payload): Promise<Record<string, number>> {
  const rows = await q<{ slug: string; articles: string; views: string }>(
    payload,
    sql`WITH arts AS (
        SELECT a.id, c.slug, '/' || c.slug || '/' || l.slug AS path
        FROM articles a
        JOIN categories c ON c.id = a.category_id
        JOIN articles_locales l ON l._parent_id = a.id AND l._locale = 'en'
        WHERE a._status = 'published' AND a.published_at > now() - interval '14 days'
      )
      SELECT arts.slug, count(DISTINCT arts.id) AS articles, count(p.id) AS views
      FROM arts LEFT JOIN zaviya_pageviews p ON p.path = arts.path AND p.ts > now() - interval '14 days'
      GROUP BY arts.slug`,
  )
  const per = rows.map((r) => ({ slug: r.slug, n: Number(r.articles), avg: Number(r.views) / Math.max(1, Number(r.articles)) }))
  const total = per.reduce((a, r) => a + r.avg * r.n, 0)
  const count = per.reduce((a, r) => a + r.n, 0)
  const overall = count ? total / count : 0
  const weights: Record<string, number> = {}
  for (const c of CATEGORIES) weights[c.slug] = 1
  if (!overall) return weights
  for (const r of per) {
    if (r.n < 3) continue // not enough evidence yet
    weights[r.slug] = Math.round(Math.min(1.2, Math.max(0.85, Math.sqrt(r.avg / overall))) * 100) / 100
  }
  return weights
}

export interface TitleCandidate {
  articleId: string
  locale: 'en'
  title: string
  url: string
  impressions: number
  ctr: number
  position: number
  topQueries: string[]
}

/** Pull Search Console page stats into metrics_daily and pick headlines worth rewriting. */
async function syncSearchConsole(payload: Payload): Promise<{ pages: number; candidates: TitleCandidate[]; topQueries: { query: string; clicks: number; impressions: number }[] }> {
  if (!gscConfigured()) return { pages: 0, candidates: [], topQueries: [] }
  const start = isoDay(-8)
  const end = isoDay(-1)
  const [pageRows, queryRows, pageQueryRows] = await Promise.all([
    gscQuery({ startDate: start, endDate: end, dimensions: ['page'], rowLimit: 2000 }),
    gscQuery({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 50 }),
    gscQuery({ startDate: start, endDate: end, dimensions: ['page', 'query'], rowLimit: 5000 }),
  ])
  const base = siteUrl()
  const articles = await q<{ id: number; path: string; title: string }>(
    payload,
    sql`SELECT a.id, '/' || c.slug || '/' || l.slug AS path, l.title
      FROM articles a JOIN categories c ON c.id = a.category_id
      JOIN articles_locales l ON l._parent_id = a.id AND l._locale = 'en'
      WHERE a._status = 'published'`,
  )
  const byUrl = new Map(articles.map((a) => [`${base}${a.path}`, a]))
  const today = new Date().toISOString().slice(0, 10)
  const retitled = (await getLearning<Record<string, string>>(payload, 'retitled_at')) ?? {}
  const candidates: TitleCandidate[] = []
  let pages = 0
  for (const r of pageRows) {
    const art = byUrl.get(r.keys[0]!)
    if (!art) continue
    pages++
    await payload.db.drizzle.execute(sql`
      DELETE FROM metrics_daily WHERE article_id = ${art.id} AND date::date = ${today}::date AND gsc_impressions IS NOT NULL`)
    await payload.db.drizzle.execute(sql`
      INSERT INTO metrics_daily (article_id, date, gsc_impressions, gsc_clicks, gsc_ctr, gsc_position)
      VALUES (${art.id}, ${today}::date, ${r.impressions}, ${r.clicks}, ${r.ctr}, ${r.position})`)
    const lastRetitle = retitled[String(art.id)]
    const recentlyChanged = lastRetitle && Date.now() - new Date(lastRetitle).getTime() < 7 * 86_400_000
    // Seen often in results but rarely clicked: the headline isn't matching what people searched.
    if (!recentlyChanged && r.impressions >= 100 && r.ctr < 0.015 && r.position <= 20) {
      candidates.push({
        articleId: String(art.id),
        locale: 'en',
        title: art.title,
        url: r.keys[0]!,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        topQueries: pageQueryRows
          .filter((x) => x.keys[0] === r.keys[0])
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 5)
          .map((x) => x.keys[1]!),
      })
    }
  }
  const topQueries = queryRows.map((r) => ({ query: r.keys[0]!, clicks: r.clicks, impressions: r.impressions }))
  await setLearning(payload, 'gsc_top_queries', { at: new Date().toISOString(), rows: topQueries })
  return { pages, candidates: candidates.sort((a, b) => b.impressions - a.impressions).slice(0, 5), topQueries }
}

/** Yesterday's first-party pageviews per article into metrics_daily. */
async function rollupPageviews(payload: Payload): Promise<number> {
  const rows = await q<{ id: number; views: string }>(
    payload,
    sql`SELECT a.id, count(p.id) AS views
      FROM articles a JOIN categories c ON c.id = a.category_id
      JOIN articles_locales l ON l._parent_id = a.id
      JOIN zaviya_pageviews p ON p.path = (CASE WHEN l._locale = 'ur' THEN '/ur' ELSE '' END) || '/' || c.slug || '/' || l.slug
      WHERE (p.ts AT TIME ZONE 'Asia/Karachi')::date = (now() AT TIME ZONE 'Asia/Karachi')::date - 1
      GROUP BY a.id`,
  )
  const day = isoDay(-1)
  for (const r of rows) {
    await payload.db.drizzle.execute(sql`DELETE FROM metrics_daily WHERE article_id = ${r.id} AND date::date = ${day}::date AND pageviews IS NOT NULL`)
    await payload.db.drizzle.execute(sql`INSERT INTO metrics_daily (article_id, date, pageviews) VALUES (${r.id}, ${day}::date, ${Number(r.views)})`)
  }
  return rows.length
}

export async function runDailyLearning(payload: Payload) {
  const rolled = await rollupPageviews(payload)
  const weights = await computeCategoryWeights(payload)
  await setLearning(payload, 'category_weights', weights)
  let gsc: Awaited<ReturnType<typeof syncSearchConsole>> = { pages: 0, candidates: [], topQueries: [] }
  let gscError: string | undefined
  try {
    gsc = await syncSearchConsole(payload)
  } catch (e) {
    gscError = e instanceof Error ? e.message : String(e)
  }
  return {
    pageviewRollups: rolled,
    categoryWeights: weights,
    gscConfigured: gscConfigured(),
    gscPages: gsc.pages,
    gscError,
    titleCandidates: gsc.candidates,
    topQueries: gsc.topQueries.slice(0, 10),
  }
}

/** Swap in a better headline, keeping the old one as a variant (the slug never changes). */
export async function retitleArticle(payload: Payload, id: string, locale: 'en' | 'ur', title: string, reason: string) {
  const doc = await payload.findByID({ collection: 'articles', id, locale, depth: 0, overrideAccess: true })
  const old = String(doc.title ?? '')
  const variants = [...((doc.titleVariants as { variant?: string }[] | undefined) ?? []), { variant: old }].slice(-5)
  await payload.update({
    collection: 'articles',
    id,
    locale,
    data: { title, titleVariants: variants, seo: { ...(doc.seo as object), metaTitle: title } },
    overrideAccess: true,
  })
  // The headline is already saved: bookkeeping must never turn that into an error for the caller.
  try {
    const retitled = (await getLearning<Record<string, string>>(payload, 'retitled_at')) ?? {}
    retitled[id] = new Date().toISOString()
    await setLearning(payload, 'retitled_at', retitled)
  } catch (e) {
    console.error('[retitle] could not record retitled_at', id, e)
  }
  await payload.create({
    collection: 'audit-log',
    data: { entity: 'articles', entityId: id, action: 'retitle', actor: 'ai:learning', payload: { old, title, reason }, at: new Date().toISOString() },
    overrideAccess: true,
  }).catch((e) => console.error('[retitle] could not write audit-log', id, e))
  return { old, title }
}
