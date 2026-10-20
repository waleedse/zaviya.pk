import { sql } from '@payloadcms/db-postgres'
import type { Endpoint, PayloadRequest } from 'payload'
import { z } from 'zod'
import { RATE_SERIES } from '@zaviya/shared'
import {
  articlePublicUrls,
  badRequest,
  json,
  parseJson,
  requireBotOrAdmin,
} from './helpers'
import { runClusterMatch } from './clusterMatch'
import { handlePipelineArticles } from './articles'
import { pageviewsReport } from '../../lib/pageviews-report'
import { revalidateDataTag } from '../../lib/revalidate'
import { getLearning, pacingStats, retitleArticle, runDailyLearning, setLearning } from '../../lib/learning'

// Phase 2: Remotion reel render queue — see docs/GROWTH.md and lib/remotion-brief.ts

const SERIES_TO_DATA_KEY: Record<string, string> = {
  gold_24k_tola: 'gold',
  gold_22k_tola: 'gold',
  usd_interbank: 'usd-pkr',
  usd_open_buy: 'usd-pkr',
  usd_open_sell: 'usd-pkr',
  petrol_super: 'petrol',
  hsd: 'petrol',
  kerosene: 'petrol',
}

const SOURCING_PLAN_KEY = 'sourcing_plan'
const SourcingPlanSchema = z.object({
  /** X searches the extension runs every discovery cycle (max 12) */
  xQueries: z.array(z.string().min(3).max(300)).max(12).optional(),
  /** Instagram newsroom profiles to read (max 12) */
  igProfiles: z.array(z.string().regex(/^[A-Za-z0-9._]{1,30}$/)).max(12).optional(),
  /** Things the editor wants found now; each becomes an X search until it expires */
  hunts: z.array(z.object({ query: z.string().min(3).max(300), until: z.string().datetime() })).max(10).optional(),
  /** Publishing pace, bounded so a bad plan can neither flood nor freeze the site */
  minIntervalMin: z.number().int().min(5).max(60).optional(),
  dailyArticleCap: z.number().int().min(24).max(200).optional(),
  notes: z.string().max(2000).optional(),
})
type SourcingPlan = z.infer<typeof SourcingPlanSchema> & { updatedAt?: string }

function guard(req: PayloadRequest): Response | null {
  return requireBotOrAdmin(req)
}

function tokenJaccard(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter(Boolean))
  const A = tok(a)
  const B = tok(b)
  if (A.size === 0 && B.size === 0) return 1
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

const pipelineEndpoints: Endpoint[] = [
  {
    path: '/pipeline/sources',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const result = await req.payload.find({
        collection: 'sources',
        where: { enabled: { equals: true } },
        limit: 500,
        overrideAccess: true,
      })
      return json({
        sources: result.docs.map((s) => ({
          id: s.id,
          key: s.key,
          name: s.name,
          url: s.url,
          type: s.type,
          trustTier: s.trustTier,
          language: s.language,
          categoryHint: s.categoryHint,
          pollIntervalSec: s.pollIntervalSec,
          etag: s.etag,
          lastPolledAt: s.lastPolledAt,
        })),
      })
    },
  },
  {
    path: '/pipeline/sources/:id',
    method: 'patch',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const id = String(req.routeParams?.id ?? '')
      const schema = z.object({
        etag: z.string().optional(),
        lastPolledAt: z.string().optional(),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      await req.payload.update({
        collection: 'sources',
        id,
        data: parsed.data,
        overrideAccess: true,
        req,
      })
      return json({ ok: true })
    },
  },
  {
    path: '/pipeline/source-items',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        items: z.array(
          z.object({
            sourceId: z.union([z.string(), z.number()]).transform(String),
            externalId: z.string(),
            url: z.string(),
            title: z.string(),
            summary: z.string().optional(),
            contentText: z.string().optional(),
            publishedAt: z.string(),
            lang: z.string().optional(),
            hash: z.string().optional(),
          }),
        ),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const inserted: { id: string; externalId: string }[] = []
      let skipped = 0
      for (const item of parsed.data.items) {
        const dup = await req.payload.find({
          collection: 'source-items',
          where: {
            and: [
              { source: { equals: Number(item.sourceId) || item.sourceId } },
              { externalId: { equals: item.externalId } },
            ],
          },
          limit: 1,
          overrideAccess: true,
        })
        if (dup.docs.length) {
          skipped++
          continue
        }
        const doc = await req.payload.create({
          collection: 'source-items',
          data: {
            source: Number(item.sourceId),
            externalId: item.externalId,
            url: item.url,
            title: item.title,
            summary: item.summary,
            contentText: item.contentText,
            publishedAt: item.publishedAt,
            lang: item.lang === 'ur' ? 'ur' : item.lang === 'en' ? 'en' : undefined,
            hash: item.hash,
          },
          overrideAccess: true,
          req,
        })
        inserted.push({ id: String(doc.id), externalId: item.externalId })
      }
      return json({ inserted, skipped })
    },
  },
  {
    path: '/pipeline/cluster-match',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        sourceItemId: z.string(),
        embedding: z.array(z.number()).length(768),
        windowHours: z.number().optional(),
        threshold: z.number().optional(),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      try {
        const result = await runClusterMatch(req.payload, parsed.data)
        return json(result)
      } catch (e) {
        return badRequest(e instanceof Error ? e.message : 'cluster-match failed')
      }
    },
  },
  {
    path: '/pipeline/clusters/:id',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const id = String(req.routeParams?.id ?? '')
      const cluster = await req.payload.findByID({
        collection: 'story-clusters',
        id,
        depth: 1,
        overrideAccess: true,
      })
      const items = await req.payload.find({
        collection: 'source-items',
        where: { cluster: { equals: id } },
        depth: 1,
        limit: 200,
        overrideAccess: true,
      })
      return json({
        id: cluster.id,
        headline: cluster.headline,
        status: cluster.status,
        itemCount: cluster.itemCount,
        distinctSources: cluster.distinctSources,
        maxTier: cluster.maxTier,
        triage: cluster.triage,
        article: cluster.article,
        items: items.docs.map((it) => ({
          id: it.id,
          title: it.title,
          url: it.url,
          summary: it.summary,
          contentText: it.contentText,
          publishedAt: it.publishedAt,
          source: {
            name: typeof it.source === 'object' && it.source ? (it.source as { name: string }).name : '',
            trustTier:
              typeof it.source === 'object' && it.source
                ? (it.source as { trustTier: number }).trustTier
                : 3,
          },
        })),
      })
    },
  },
  {
    path: '/pipeline/clusters/:id',
    method: 'patch',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const id = String(req.routeParams?.id ?? '')
      const schema = z.object({
        status: z.string().optional(),
        triage: z.unknown().optional(),
        article: z.string().optional(),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      await req.payload.update({
        collection: 'story-clusters',
        id,
        data: {
          status: parsed.data.status as
            | 'new'
            | 'triaged'
            | 'rejected'
            | 'in_review'
            | 'writing'
            | 'published'
            | 'updated'
            | undefined,
          triage: parsed.data.triage as Record<string, unknown> | undefined,
          article: parsed.data.article ? Number(parsed.data.article) : undefined,
        },
        overrideAccess: true,
        req,
      })
      return json({ ok: true })
    },
  },
  {
    path: '/pipeline/articles',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      return handlePipelineArticles(req)
    },
  },
  {
    path: '/pipeline/articles/:id/live-update',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const id = String(req.routeParams?.id ?? '')
      const schema = z.object({
        at: z.string(),
        text: z.object({
          en: z.string().optional(),
          ur: z.string().optional(),
        }),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const article = await req.payload.findByID({
        collection: 'articles',
        id,
        locale: 'all',
        depth: 0,
        overrideAccess: true,
      })
      const updates = Array.isArray(article.updates) ? [...article.updates] : []
      updates.unshift({
        at: parsed.data.at,
        text: {
          en: parsed.data.text.en,
          ur: parsed.data.text.ur,
        },
      })
      await req.payload.update({
        collection: 'articles',
        id,
        data: { updates, isLive: true },
        overrideAccess: true,
        req,
      })
      return json({ ok: true })
    },
  },
  {
    path: '/pipeline/review',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        clusterId: z.string(),
        articleId: z.string().optional(),
        reason: z.string(),
        flags: z.array(z.string()).default([]),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const doc = await req.payload.create({
        collection: 'review-queue',
        data: {
          cluster: Number(parsed.data.clusterId),
          article: parsed.data.articleId ? Number(parsed.data.articleId) : undefined,
          reason: parsed.data.reason,
          flags: parsed.data.flags,
        },
        overrideAccess: true,
        req,
      })
      return json({ id: doc.id })
    },
  },
  {
    path: '/pipeline/review/:id',
    method: 'patch',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const id = String(req.routeParams?.id ?? '')
      const schema = z.object({
        decision: z.enum(['approve', 'reject', 'hold', 'edit']),
        decidedBy: z.string(),
        telegramMessageId: z.string().optional(),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const existing = await req.payload.findByID({
        collection: 'review-queue',
        id,
        depth: 0,
        overrideAccess: true,
      })
      await req.payload.update({
        collection: 'review-queue',
        id,
        data: {
          ...parsed.data,
          decidedAt: new Date().toISOString(),
        },
        overrideAccess: true,
        req,
      })
      return json({
        ok: true,
        clusterId: existing.cluster,
        articleId: existing.article,
      })
    },
  },
  {
    path: '/pipeline/internal-links',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        keywords: z.array(z.string()),
        locale: z.enum(['en', 'ur']),
        limit: z.number().optional(),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const limit = parsed.data.limit ?? 5
      const needles = parsed.data.keywords.map((k) => k.toLowerCase())
      const articles = await req.payload.find({
        collection: 'articles',
        locale: parsed.data.locale,
        where: {
          and: [
            { _status: { equals: 'published' } },
            { workflow: { not_equals: 'retracted' } },
          ],
        },
        sort: '-publishedAt',
        limit: 100,
        depth: 1,
        overrideAccess: true,
      })
      const links: { title: string; url: string }[] = []
      for (const a of articles.docs) {
        const title = String(a.title ?? '').toLowerCase()
        const tagNames =
          Array.isArray(a.tags) && a.tags.length
            ? a.tags
                .map((t) => (typeof t === 'object' && t ? String((t as { name?: string }).name ?? '') : ''))
                .join(' ')
                .toLowerCase()
            : ''
        const hay = `${title} ${tagNames}`
        if (needles.some((n) => hay.includes(n))) {
          const cat =
            typeof a.category === 'object' && a.category ? (a.category as { slug: string }).slug : ''
          const slug = String(a.slug ?? '')
          const url =
            parsed.data.locale === 'ur' ? `/ur/${cat}/${slug}` : `/${cat}/${slug}`
          links.push({ title: String(a.title), url })
        }
        if (links.length >= limit) break
      }
      return json({ links })
    },
  },
  {
    path: '/pipeline/title-check',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        title: z.string(),
        locale: z.enum(['en', 'ur']),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
      let maxSimilarity = 0
      let closest: { title: string; url: string } | undefined

      try {
        const drizzle = req.payload.db.drizzle
        const simResult = await drizzle.execute(sql`
          SELECT a.id, l.title, l.slug, c.slug AS category_slug,
                 similarity(l.title, ${parsed.data.title}) AS sim
          FROM articles a
          INNER JOIN articles_locales l ON l._parent_id = a.id AND l._locale = ${parsed.data.locale}
          LEFT JOIN categories c ON c.id = a.category_id
          WHERE a._status = 'published'
            AND (a.workflow IS NULL OR a.workflow != 'retracted')
            AND a.published_at >= ${since}
            AND l.title IS NOT NULL
          ORDER BY sim DESC
          LIMIT 1
        `)
        const row = simResult.rows[0] as
          | { id: string; title: string; slug: string; category_slug: string; sim: number }
          | undefined
        if (row && row.sim != null) {
          maxSimilarity = Number(row.sim)
          const prefix = parsed.data.locale === 'ur' ? '/ur' : ''
          closest = {
            title: row.title,
            url: `${prefix}/${row.category_slug}/${row.slug}`,
          }
        }
      } catch {
        // pg_trgm / column names may differ before migration — fall back to Jaccard via Local API
        const articles = await req.payload.find({
          collection: 'articles',
          locale: parsed.data.locale,
          where: {
            and: [
              { _status: { equals: 'published' } },
              { workflow: { not_equals: 'retracted' } },
              { publishedAt: { greater_than: since } },
            ],
          },
          depth: 1,
          limit: 200,
          overrideAccess: true,
        })
        for (const a of articles.docs) {
          const sim = tokenJaccard(parsed.data.title, String(a.title ?? ''))
          if (sim > maxSimilarity) {
            maxSimilarity = sim
            const cat =
              typeof a.category === 'object' && a.category ? (a.category as { slug: string }).slug : ''
            const slug = String(a.slug ?? '')
            const prefix = parsed.data.locale === 'ur' ? '/ur' : ''
            closest = { title: String(a.title), url: `${prefix}/${cat}/${slug}` }
          }
        }
      }

      return json({ maxSimilarity, closest })
    },
  },
  {
    path: '/pipeline/retract/:id',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const id = String(req.routeParams?.id ?? '')
      const schema = z.object({ reason: z.string() })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      await req.payload.update({
        collection: 'articles',
        id,
        data: { workflow: 'retracted', _status: 'draft' },
        overrideAccess: true,
        req,
      })
      const posts = await req.payload.find({
        collection: 'social-posts',
        where: { article: { equals: id } },
        limit: 50,
        overrideAccess: true,
      })
      return json({
        socialPosts: posts.docs.map((p) => ({
          id: p.id,
          platform: p.platform,
          externalId: p.externalId,
        })),
      })
    },
  },
  {
    path: '/pipeline/data-points',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        points: z.array(
          z.object({
            series: z.enum(RATE_SERIES),
            city: z.string().optional(),
            value: z.number(),
            unit: z.string(),
            source: z.string(),
            observedAt: z.string(),
          }),
        ),
        // Full rate tables for the data pages (all karats, other currencies...)
        snapshots: z
          .array(
            z.object({
              key: z.enum(['gold', 'usd-pkr', 'petrol']),
              table: z.array(z.object({ label: z.string(), values: z.record(z.union([z.number(), z.string()])) })),
            }),
          )
          .optional(),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      let inserted = 0
      const keys = new Set<string>()
      for (const snap of parsed.data.snapshots ?? []) {
        const found = await req.payload.find({ collection: 'data-pages', where: { key: { equals: snap.key } }, limit: 1, overrideAccess: true })
        if (found.docs[0]) {
          await req.payload.update({ collection: 'data-pages', id: found.docs[0].id, data: { latestSnapshot: snap.table }, overrideAccess: true, req })
          keys.add(snap.key)
        }
      }
      for (const pt of parsed.data.points) {
        await req.payload.create({
          collection: 'data-points',
          data: pt,
          overrideAccess: true,
          req,
        })
        inserted++
        const key = SERIES_TO_DATA_KEY[pt.series]
        if (key) keys.add(key)
      }
      for (const key of keys) await revalidateDataTag(key)
      return json({ inserted })
    },
  },
  {
    path: '/pipeline/social-posts',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        idempotencyKey: z.string(),
        article: z.string(),
        platform: z.enum(['facebook', 'instagram', 'x', 'whatsapp']),
        format: z.enum(['link', 'card', 'carousel', 'reel', 'text']),
        copy: z.string(),
        mediaUrls: z.array(z.string()).optional(),
        status: z.enum(['queued', 'posting', 'posted', 'failed', 'deleted']),
        scheduledAt: z.string().optional(),
        postedAt: z.string().optional(),
        externalId: z.string().optional(),
        via: z.enum(['api', 'extension']).optional(),
        error: z.string().optional(),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const existing = await req.payload.find({
        collection: 'social-posts',
        where: { idempotencyKey: { equals: parsed.data.idempotencyKey } },
        limit: 1,
        overrideAccess: true,
      })
      const socialData = {
        ...parsed.data,
        article: Number(parsed.data.article),
        mediaUrls: parsed.data.mediaUrls ?? [],
      }
      if (existing.docs[0]) {
        const updated = await req.payload.update({
          collection: 'social-posts',
          id: existing.docs[0].id,
          data: socialData,
          overrideAccess: true,
          req,
        })
        return json({ id: updated.id, created: false })
      }
      const created = await req.payload.create({
        collection: 'social-posts',
        data: socialData,
        overrideAccess: true,
        req,
      })
      return json({ id: created.id, created: true })
    },
  },
  {
    // ZAV-115: what already went out today, so the social worker can hold to settings.dailyCaps.
    // Counts posted rows, rows in flight, and "failed" rows that carry an external id (they are live, ZAV-114).
    path: '/pipeline/social-count',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const since = new Date(req.searchParams?.get('since') ?? '')
      if (Number.isNaN(since.getTime())) return badRequest('since must be an ISO date')
      const platforms = ['facebook', 'instagram', 'x'] as const
      const counts: Record<string, number> = {}
      const lastPostedAt: Record<string, string | null> = {}
      for (const platform of platforms) {
        const live = await req.payload.find({
          collection: 'social-posts',
          where: {
            and: [
              { platform: { equals: platform } },
              { createdAt: { greater_than_equal: since.toISOString() } },
              {
                or: [
                  { status: { in: ['posted', 'posting'] } },
                  { and: [{ status: { equals: 'failed' } }, { externalId: { exists: true } }] },
                ],
              },
            ],
          },
          sort: '-createdAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        counts[platform] = live.totalDocs
        const last = live.docs[0] as { postedAt?: string | null; createdAt?: string } | undefined
        lastPostedAt[platform] = last?.postedAt ?? last?.createdAt ?? null
      }
      return json({ since: since.toISOString(), counts, lastPostedAt })
    },
  },
  {
    // ZAV-120: stories already posted on a platform lately, so the social worker never posts one story twice.
    path: '/pipeline/social-recent',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const platform = req.searchParams?.get('platform') ?? ''
      if (!['facebook', 'instagram', 'x'].includes(platform)) return badRequest('platform must be facebook, instagram or x')
      const hours = Math.min(Math.max(Number(req.searchParams?.get('hours') ?? 6) || 6, 1), 48)
      const rows = await req.payload.find({
        collection: 'social-posts',
        where: {
          and: [
            { platform: { equals: platform } },
            { createdAt: { greater_than_equal: new Date(Date.now() - hours * 3_600_000).toISOString() } },
            {
              or: [
                { status: { in: ['posted', 'posting', 'queued'] } },
                { and: [{ status: { equals: 'failed' } }, { externalId: { exists: true } }] },
              ],
            },
          ],
        },
        depth: 1,
        locale: 'en',
        limit: 300,
        overrideAccess: true,
      })
      const posts = rows.docs.flatMap((d) => {
        const a = d.article as { id?: number | string; title?: string; storyCluster?: number | string | { id: number | string } | null } | number | string | null
        if (!a || typeof a !== 'object' || !a.title) return []
        const c = a.storyCluster
        return [{ articleId: String(a.id), clusterId: c == null ? null : String(typeof c === 'object' ? c.id : c), title: a.title }]
      })
      return json({ posts })
    },
  },
  {
    // ZAV-116: read-only pageviews per PKT day by traffic source, for the PM scoreboard.
    path: '/pipeline/analytics/pageviews',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      return json(await pageviewsReport(req.payload, Number(req.searchParams?.get('days') ?? 14)))
    },
  },
  {
    // ZAV-108: posts that went out lately and have an external id, with the metrics already stored, so the worker knows what to fetch.
    path: '/pipeline/social-posts/recent',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const hours = Math.min(Math.max(Number(req.searchParams?.get('hours') ?? 50) || 50, 1), 200)
      const rows = await req.payload.find({
        collection: 'social-posts',
        where: {
          and: [
            { createdAt: { greater_than_equal: new Date(Date.now() - hours * 3_600_000).toISOString() } },
            { externalId: { exists: true } },
            { status: { in: ['posted', 'failed'] } },
          ],
        },
        sort: '-createdAt',
        limit: 300,
        depth: 0,
        overrideAccess: true,
      })
      return json({
        posts: rows.docs.map((d) => ({
          id: d.id,
          platform: d.platform,
          externalId: d.externalId,
          postedAt: d.postedAt ?? d.createdAt,
          metrics: d.metrics ?? null,
        })),
      })
    },
  },
  {
    // Stores one metrics snapshot ("h1" or "h24") on a social post, keeping the other snapshots.
    path: '/pipeline/social-posts/:id/metrics',
    method: 'put',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(
        req,
        z.object({ window: z.enum(['h1', 'h24']), data: z.record(z.union([z.number(), z.string(), z.null()])) }),
      )
      if ('error' in parsed) return parsed.error
      const id = String(req.routeParams?.id ?? '')
      const doc = await req.payload.findByID({ collection: 'social-posts', id, depth: 0, overrideAccess: true })
      const previous = doc.metrics && typeof doc.metrics === 'object' && !Array.isArray(doc.metrics) ? (doc.metrics as Record<string, unknown>) : {}
      const metrics = { ...previous, [parsed.data.window]: { ...parsed.data.data, at: new Date().toISOString() } }
      await req.payload.update({ collection: 'social-posts', id, data: { metrics }, overrideAccess: true, req })
      return json({ ok: true })
    },
  },
  {
    // Daily follower counts per platform. metrics-daily is per article, so they live in the learning store (no schema change).
    path: '/pipeline/followers',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(
        req,
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          facebook: z.number().int().nonnegative().optional(),
          instagram: z.number().int().nonnegative().optional(),
          x: z.number().int().nonnegative().optional(),
        }),
      )
      if ('error' in parsed) return parsed.error
      const { date, ...counts } = parsed.data
      const key = `followers:${date}`
      const existing = (await getLearning<Record<string, number>>(req.payload, key)) ?? {}
      await setLearning(req.payload, key, { ...existing, ...counts })
      return json({ ok: true, date, followers: { ...existing, ...counts } })
    },
  },
  {
    path: '/pipeline/followers',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const days = Math.min(Math.max(Number(req.searchParams?.get('days') ?? 14) || 14, 1), 90)
      const out: { date: string; facebook?: number; instagram?: number; x?: number }[] = []
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(Date.now() + 5 * 3_600_000 - i * 86_400_000).toISOString().slice(0, 10)
        const row = await getLearning<Record<string, number>>(req.payload, `followers:${date}`)
        if (row) out.push({ date, ...row })
      }
      return json({ followers: out })
    },
  },
  {
    path: '/pipeline/settings',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const settings = await req.payload.findGlobal({ slug: 'settings', overrideAccess: true })
      // Pacing and learned weights the triage rules need, alongside the editable settings.
      const [pacing, categoryWeights, plan] = await Promise.all([
        pacingStats(req.payload),
        getLearning<Record<string, number>>(req.payload, 'category_weights'),
        getLearning<SourcingPlan>(req.payload, SOURCING_PLAN_KEY),
      ])
      return json({
        ...settings,
        ...pacing,
        categoryWeights: categoryWeights ?? {},
        // The editor's sourcing plan can tighten or loosen the pace within safe bounds
        ...(plan?.minIntervalMin ? { minIntervalMin: plan.minIntervalMin } : {}),
        dailyCaps: {
          ...(settings.dailyCaps ?? {}),
          articles: plan?.dailyArticleCap ?? Number(process.env.DAILY_ARTICLE_CAP ?? 60),
        },
        sourcingPlan: plan ?? null,
      })
    },
  },
  {
    // Email command "set cap": the settings global is admin-only, so the bot changes one platform's cap here
    path: '/pipeline/daily-cap',
    method: 'put',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, z.object({ platform: z.enum(['facebook', 'instagram', 'x']), perDay: z.number().int().min(0).max(100) }))
      if ('error' in parsed) return parsed.error
      const settings = await req.payload.findGlobal({ slug: 'settings', overrideAccess: true })
      const dailyCaps = { ...(settings.dailyCaps ?? {}), [parsed.data.platform]: parsed.data.perDay }
      await req.payload.updateGlobal({ slug: 'settings', data: { dailyCaps }, overrideAccess: true })
      return json({ ok: true, dailyCaps })
    },
  },
  {
    path: '/pipeline/metrics/daily',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      return json(await runDailyLearning(req.payload))
    },
  },
  {
    path: '/pipeline/articles/:id/retitle',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, z.object({ locale: z.enum(['en', 'ur']), title: z.string().min(20).max(110), reason: z.string() }))
      if ('error' in parsed) return parsed.error
      const id = String(req.routeParams?.id ?? '')
      return json(await retitleArticle(req.payload, id, parsed.data.locale, parsed.data.title, parsed.data.reason))
    },
  },
  {
    // The editor agent's sourcing plan: what the Chrome extension searches on X / Instagram, what to
    // hunt for, and the publishing pace. Read by the worker every discovery cycle.
    path: '/pipeline/sourcing-plan',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      return json((await getLearning<SourcingPlan>(req.payload, SOURCING_PLAN_KEY)) ?? {})
    },
  },
  {
    path: '/pipeline/sourcing-plan',
    method: 'put',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, SourcingPlanSchema)
      if ('error' in parsed) return parsed.error
      const plan = { ...parsed.data, updatedAt: new Date().toISOString() }
      await setLearning(req.payload, SOURCING_PLAN_KEY, plan)
      return json(plan)
    },
  },
  {
    // "Coming up" dates people search for (prize bond draws, SBP policy, holidays, results, matches).
    // The research agent keeps this list current; the homepage briefing shows the next few.
    path: '/pipeline/upcoming',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      return json((await getLearning(req.payload, 'upcoming_events')) ?? [])
    },
  },
  {
    path: '/pipeline/upcoming',
    method: 'put',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(
        req,
        z.array(
          z.object({
            title: z.string().min(3).max(90),
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            kind: z.enum(['prices', 'money', 'holiday', 'results', 'sports', 'politics', 'religion', 'other']).default('other'),
            href: z.string().max(300).optional(),
            source: z.string().max(300).optional(),
          }),
        ).max(30),
      )
      if ('error' in parsed) return parsed.error
      await setLearning(req.payload, 'upcoming_events', parsed.data)
      return json(parsed.data)
    },
  },
  {
    // Articles of the last 48h (live, or drafts waiting for the editor) so triage can tell that a new
    // cluster is the same event as one we already hold (ZAV-134).
    path: '/pipeline/recent-articles',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const since = new Date(Date.now() - 48 * 3_600_000).toISOString()
      const [live, drafts] = await Promise.all([
        req.payload.find({
          collection: 'articles',
          where: {
            and: [
              { _status: { equals: 'published' } },
              { workflow: { not_equals: 'retracted' } },
              { publishedAt: { greater_than: since } },
            ],
          },
          sort: '-publishedAt',
          limit: 300,
          depth: 0,
          locale: 'en',
          overrideAccess: true,
        }),
        req.payload.find({
          collection: 'articles',
          where: {
            and: [
              { _status: { equals: 'draft' } },
              { workflow: { equals: 'in_review' } },
              { createdAt: { greater_than: since } },
            ],
          },
          draft: true,
          sort: '-createdAt',
          limit: 100,
          depth: 0,
          locale: 'en',
          overrideAccess: true,
        }),
      ])
      const row = (a: (typeof live.docs)[number], published: boolean) => {
        const updates = Array.isArray(a.updates) ? a.updates : []
        const at = updates.map((u) => new Date(String(u.at)).getTime()).filter(Number.isFinite)
        return {
          id: String(a.id),
          title: String(a.title ?? ''),
          publishedAt: (published ? a.publishedAt : a.createdAt) ?? null,
          published,
          lastUpdateAt: at.length ? new Date(Math.max(...at)).toISOString() : null,
        }
      }
      return json([...live.docs.map((a) => row(a, true)), ...drafts.docs.map((a) => row(a, false))].filter((r) => r.title))
    },
  },
  {
    // Editor gate: written articles waiting for the editor (drafts with workflow in_review)
    path: '/pipeline/gate',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const res = await req.payload.find({
        collection: 'articles',
        // Newest first, last 24 hours: news goes stale, and oldest-first hid every new story behind a backlog
        where: {
          and: [
            { _status: { equals: 'draft' } },
            { workflow: { equals: 'in_review' } },
            { createdAt: { greater_than: new Date(Date.now() - 24 * 60 * 60_000).toISOString() } },
          ],
        },
        draft: true,
        sort: '-createdAt',
        limit: 60,
        depth: 1,
        locale: 'en',
        overrideAccess: true,
      })
      return json(
        res.docs.map((a) => ({
          id: a.id,
          title: a.title,
          dek: a.dek,
          category: typeof a.category === 'object' && a.category ? a.category.slug : a.category,
          priority: a.priority,
          createdAt: a.createdAt,
          sources: (a.sources ?? []).map((s) => ({ name: s.name, url: s.url })),
          hasImage: Boolean(a.heroImage),
        })),
      )
    },
  },
  {
    // Editor pitch: triaged stories not written yet (the writer only writes what the editor approves).
    // Newest first, last 24 hours; each with what the sources say, so the editor can judge without the article.
    path: '/pipeline/pitches',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const res = (await req.payload.db.drizzle.execute(sql`
        SELECT c.id, c.headline, c.triage, c.distinct_sources AS "distinctSources", c.first_seen_at AS "firstSeenAt",
          COALESCE((
            SELECT json_agg(json_build_object('title', i.title, 'url', i.url, 'summary', LEFT(COALESCE(i.summary, i.content_text, ''), 300)) ORDER BY i.published_at DESC)
            FROM (SELECT * FROM source_items si WHERE si.cluster_id = c.id ORDER BY si.published_at DESC LIMIT 4) i
          ), '[]'::json) AS items
        FROM story_clusters c
        WHERE c.status = 'triaged' AND c.triage->>'codeOutcome' = 'pitch'
          AND c.updated_at > now() - interval '24 hours'
        ORDER BY c.updated_at DESC
        LIMIT 60
      `)) as unknown as {
        rows: { id: number; headline: string; triage: Record<string, unknown> | null; distinctSources: number; firstSeenAt: string; items: unknown[] }[]
      }
      return json(
        res.rows.map((r) => ({
          clusterId: String(r.id),
          headline: r.headline,
          category: r.triage?.category,
          priority: r.triage?.suggestedPriority,
          weightedScore: r.triage?.weightedScore,
          reason: r.triage?.reason,
          pitchedAt: r.triage?.pitchedAt,
          firstSeenAt: r.firstSeenAt,
          distinctSources: Number(r.distinctSources),
          sources: r.items,
        })),
      )
    },
  },
  {
    // The editor decides on a pitch: write it (then image and publish follow on their own), or reject it.
    path: '/pipeline/pitches/:id',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, z.object({ action: z.enum(['write', 'reject']), note: z.string().max(500).optional() }))
      if ('error' in parsed) return parsed.error
      const id = String(req.routeParams?.id ?? '')
      if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400)
      await req.payload.db.drizzle.execute(
        sql`INSERT INTO zaviya_commands (kind, payload, created_by) VALUES ('pitch', ${JSON.stringify({ clusterId: id, action: parsed.data.action, note: parsed.data.note ?? '' })}::jsonb, 'agent:editor')`,
      )
      return json({ ok: true, clusterId: id, action: parsed.data.action })
    },
  },
  {
    // The editor decides: publish now, or reject (stays an unpublished draft). The worker carries it out.
    path: '/pipeline/gate/:id',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const parsed = await parseJson(req, z.object({ action: z.enum(['publish', 'reject']), note: z.string().max(500).optional() }))
      if ('error' in parsed) return parsed.error
      const id = String(req.routeParams?.id ?? '')
      if (!/^\d+$/.test(id)) return json({ error: 'bad id' }, 400)
      if (parsed.data.action === 'reject') {
        await req.payload.update({ collection: 'articles', id, data: { workflow: 'draft' }, draft: true, overrideAccess: true, req })
      }
      await req.payload.db.drizzle.execute(
        sql`INSERT INTO zaviya_commands (kind, payload, created_by) VALUES ('gate', ${JSON.stringify({ articleId: id, action: parsed.data.action, note: parsed.data.note ?? '' })}::jsonb, 'agent:editor')`,
      )
      return json({ ok: true, id, action: parsed.data.action })
    },
  },
  {
    path: '/pipeline/heartbeat',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z
        .object({
          version: z.string(),
          queues: z.record(
            z.object({
              waiting: z.number(),
              active: z.number(),
              failed: z.number(),
            }),
          ),
        })
        .passthrough()
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const settings = await req.payload.findGlobal({ slug: 'settings', overrideAccess: true })
      // Commands queued from the admin Control Room are handed to the worker here.
      const commands = (await req.payload.db.drizzle.execute(sql`
        UPDATE zaviya_commands SET done_at = now()
        WHERE id IN (SELECT id FROM zaviya_commands WHERE done_at IS NULL ORDER BY created_at LIMIT 20)
        RETURNING id, kind, payload
      `)) as unknown as { rows: { id: string; kind: string; payload: Record<string, unknown> }[] }
      await req.payload.updateGlobal({
        slug: 'settings',
        data: {
          lastHeartbeat: new Date().toISOString(),
          lastHeartbeatMeta: parsed.data,
        },
        overrideAccess: true,
        req,
      })
      return json({ ok: true, killSwitch: Boolean(settings.killSwitch), commands: commands.rows ?? [] })
    },
  },
]

export const pipelineEndpointsExport = pipelineEndpoints
