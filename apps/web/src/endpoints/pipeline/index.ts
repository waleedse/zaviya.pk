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
import { revalidateDataTag } from '../../lib/revalidate'

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
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      let inserted = 0
      const keys = new Set<string>()
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
    path: '/pipeline/settings',
    method: 'get',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const settings = await req.payload.findGlobal({ slug: 'settings', overrideAccess: true })
      return json(settings)
    },
  },
  {
    path: '/pipeline/heartbeat',
    method: 'post',
    handler: async (req) => {
      const denied = guard(req)
      if (denied) return denied
      const schema = z.object({
        version: z.string(),
        queues: z.record(
          z.object({
            waiting: z.number(),
            active: z.number(),
            failed: z.number(),
          }),
        ),
      })
      const parsed = await parseJson(req, schema)
      if ('error' in parsed) return parsed.error
      const settings = await req.payload.findGlobal({ slug: 'settings', overrideAccess: true })
      await req.payload.updateGlobal({
        slug: 'settings',
        data: {
          lastHeartbeat: new Date().toISOString(),
          lastHeartbeatMeta: parsed.data,
        },
        overrideAccess: true,
        req,
      })
      return json({ ok: true, killSwitch: Boolean(settings.killSwitch) })
    },
  },
]

export const pipelineEndpointsExport = pipelineEndpoints
