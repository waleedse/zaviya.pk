import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/** Everything the admin Control Room shows, loaded in one pass on the server. */

type Rows<T> = { rows: T[] }

export interface ControlRoomData {
  generatedAt: string
  traffic: {
    liveVisitors: number
    today: { pageviews: number; visitors: number }
    yesterday: { pageviews: number; visitors: number }
    last7: { pageviews: number; visitors: number }
    last30: { pageviews: number; visitors: number }
    daily: { day: string; pageviews: number; visitors: number; search: number }[]
    sourcesToday: { source: string; pageviews: number }[]
    sources7: { source: string; pageviews: number }[]
    devices7: { device: string; pageviews: number }[]
    topPagesToday: { path: string; title?: string; pageviews: number; sources: { source: string; pageviews: number }[] }[]
    firstSearchVisit: string | null
    searchVisits7: number
  }
  content: {
    publishedToday: number
    published7: number
    publishedTotal: number
    latest: { id: string; title: string; href: string; category: string; publishedAt: string; qaScore?: number; model?: string; hasImage: boolean; views: number }[]
  }
  pipeline: {
    clusters24h: { status: string; count: number }[]
    items24h: number
    reviews: { id: string; clusterId: string; headline: string; reason: string; createdAt: string }[]
    sources: { name: string; lastPolledAt: string | null; enabled: boolean; items24h: number }[]
  }
  worker: {
    lastHeartbeat: string | null
    online: boolean
    killSwitch: boolean
    paused: boolean
    integrations: { ollama?: boolean; gemini?: boolean; extension?: boolean; telegram?: boolean }
    queues: Record<string, { waiting: number; active: number; failed: number }>
    trends: { name: string; traffic?: string }[]
    xTrends: { name: string; traffic?: string }[]
    pendingCommands: number
    geminiCooldowns: Record<string, string>
  }
  /** What went out to each platform in the last 24 hours, and why anything did not */
  social: {
    platforms: { platform: string; posted: number; failed: number }[]
    recentFailures: { platform: string; error: string; at: string }[]
  }
  learning: {
    categoryWeights: Record<string, number>
    topQueries: { query: string; clicks: number; impressions: number }[]
    gscConnected: boolean
  }
}

async function q<T>(payload: Payload, query: ReturnType<typeof sql>): Promise<T[]> {
  const res = (await payload.db.drizzle.execute(query)) as unknown as Rows<T>
  return res.rows ?? []
}

const num = (v: unknown) => Number(v ?? 0)

export async function loadControlRoom(payload: Payload): Promise<ControlRoomData> {
  // Day boundaries follow Pakistan time, which is what the editors think in.
  const todayStart = sql`(date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') AT TIME ZONE 'Asia/Karachi')`

  const [live] = await q<{ n: string }>(payload, sql`SELECT count(DISTINCT visitor) AS n FROM zaviya_pageviews WHERE ts > now() - interval '5 minutes'`)
  const [windows] = await q<Record<string, string>>(
    payload,
    sql`SELECT
      count(*) FILTER (WHERE ts >= ${todayStart}) AS pv_today,
      count(DISTINCT visitor) FILTER (WHERE ts >= ${todayStart}) AS uv_today,
      count(*) FILTER (WHERE ts >= ${todayStart} - interval '1 day' AND ts < ${todayStart}) AS pv_yday,
      count(DISTINCT visitor) FILTER (WHERE ts >= ${todayStart} - interval '1 day' AND ts < ${todayStart}) AS uv_yday,
      count(*) FILTER (WHERE ts >= now() - interval '7 days') AS pv_7,
      count(DISTINCT visitor) FILTER (WHERE ts >= now() - interval '7 days') AS uv_7,
      count(*) AS pv_30,
      count(DISTINCT visitor) AS uv_30,
      count(*) FILTER (WHERE ts >= now() - interval '7 days' AND source IN ('google','discover','google-news','bing')) AS search_7
    FROM zaviya_pageviews WHERE ts >= now() - interval '30 days'`,
  )
  const daily = await q<{ day: string; pv: string; uv: string; search: string }>(
    payload,
    sql`SELECT d::date::text AS day,
        count(p.id) AS pv, count(DISTINCT p.visitor) AS uv,
        count(p.id) FILTER (WHERE p.source IN ('google','discover','google-news','bing')) AS search
      FROM generate_series((now() AT TIME ZONE 'Asia/Karachi')::date - 13, (now() AT TIME ZONE 'Asia/Karachi')::date, interval '1 day') d
      LEFT JOIN zaviya_pageviews p ON (p.ts AT TIME ZONE 'Asia/Karachi')::date = d::date
      GROUP BY d ORDER BY d`,
  )
  const sourcesToday = await q<{ source: string; pv: string }>(
    payload,
    sql`SELECT source, count(*) AS pv FROM zaviya_pageviews WHERE ts >= ${todayStart} AND source <> 'internal' GROUP BY source ORDER BY pv DESC`,
  )
  const sources7 = await q<{ source: string; pv: string }>(
    payload,
    sql`SELECT source, count(*) AS pv FROM zaviya_pageviews WHERE ts >= now() - interval '7 days' AND source <> 'internal' GROUP BY source ORDER BY pv DESC`,
  )
  const devices7 = await q<{ device: string; pv: string }>(
    payload,
    sql`SELECT coalesce(device,'unknown') AS device, count(*) AS pv FROM zaviya_pageviews WHERE ts >= now() - interval '7 days' GROUP BY 1 ORDER BY pv DESC`,
  )
  const topPages = await q<{ path: string; pv: string }>(
    payload,
    sql`SELECT path, count(*) AS pv FROM zaviya_pageviews WHERE ts >= ${todayStart} GROUP BY path ORDER BY pv DESC LIMIT 15`,
  )
  // Where each of those pages' visits came from (Facebook post, X, Google...)
  const pageSources = topPages.length
    ? await q<{ path: string; source: string; pv: string }>(
        payload,
        sql`SELECT path, source, count(*) AS pv FROM zaviya_pageviews
          WHERE ts >= ${todayStart} AND path IN (${sql.join(topPages.map((p) => sql`${p.path}`), sql`, `)})
          GROUP BY path, source ORDER BY pv DESC`,
      )
    : []
  const [firstSearch] = await q<{ ts: string | null }>(
    payload,
    sql`SELECT min(ts)::text AS ts FROM zaviya_pageviews WHERE source IN ('google','discover','google-news','bing')`,
  )
  const views7 = await q<{ path: string; pv: string }>(
    payload,
    sql`SELECT path, count(*) AS pv FROM zaviya_pageviews WHERE ts >= now() - interval '7 days' GROUP BY path`,
  )
  const viewsByPath = new Map(views7.map((r) => [r.path, num(r.pv)]))

  // Content
  const since = (ms: number) => new Date(Date.now() - ms).toISOString()
  const published = { _status: { equals: 'published' } } as const
  const [today, week, total, latest] = await Promise.all([
    payload.count({ collection: 'articles', where: { and: [published, { publishedAt: { greater_than: since(24 * 3600e3) } }] }, overrideAccess: true }),
    payload.count({ collection: 'articles', where: { and: [published, { publishedAt: { greater_than: since(7 * 24 * 3600e3) } }] }, overrideAccess: true }),
    payload.count({ collection: 'articles', where: published, overrideAccess: true }),
    payload.find({ collection: 'articles', where: published, sort: '-publishedAt', limit: 10, depth: 1, locale: 'en', overrideAccess: true }),
  ])

  const articleHref = (doc: { slug?: unknown; category?: unknown }) => {
    const cat = typeof doc.category === 'object' && doc.category ? (doc.category as { slug?: string }).slug ?? 'news' : 'news'
    return `/${cat}/${String(doc.slug ?? '')}`
  }
  const titleByPath = new Map<string, string>()
  const latestRows = latest.docs.map((d) => {
    const href = articleHref(d)
    titleByPath.set(href, String(d.title ?? ''))
    return {
      id: String(d.id),
      title: String(d.title ?? ''),
      href,
      category: typeof d.category === 'object' && d.category ? String((d.category as { name?: string }).name ?? '') : '',
      publishedAt: String(d.publishedAt ?? d.createdAt),
      qaScore: (d.ai as { qaScore?: number } | undefined)?.qaScore,
      model: (d.ai as { model?: string } | undefined)?.model ?? undefined,
      hasImage: Boolean(d.heroImage),
      views: viewsByPath.get(href) ?? 0,
    }
  })

  // Titles for top pages that are articles not in the latest list
  const missing = topPages.map((p) => p.path).filter((p) => !titleByPath.has(p) && p.split('/').filter(Boolean).length >= 2)
  if (missing.length) {
    const slugs = missing.map((p) => p.split('/').filter(Boolean).pop()!)
    const found = await payload.find({ collection: 'articles', where: { slug: { in: slugs } }, limit: slugs.length, depth: 1, locale: 'all', overrideAccess: true })
    for (const d of found.docs) {
      const slugs = d.slug as unknown as Record<string, string>
      const titles = d.title as unknown as Record<string, string>
      for (const loc of ['en', 'ur'] as const) {
        if (!slugs?.[loc]) continue
        const cat = typeof d.category === 'object' && d.category ? (d.category as { slug?: string }).slug : 'news'
        titleByPath.set(`${loc === 'ur' ? '/ur' : ''}/${cat}/${slugs[loc]}`, titles?.[loc] ?? '')
      }
    }
  }

  // Pipeline
  const clusters24h = await q<{ status: string; n: string }>(
    payload,
    sql`SELECT status::text AS status, count(*) AS n FROM story_clusters WHERE updated_at > now() - interval '24 hours' GROUP BY 1 ORDER BY n DESC`,
  )
  const [items24h] = await q<{ n: string }>(payload, sql`SELECT count(*) AS n FROM source_items WHERE created_at > now() - interval '24 hours'`)
  const reviews = await q<{ id: string; cluster_id: string; headline: string | null; reason: string; created_at: string }>(
    payload,
    sql`SELECT r.id::text, r.cluster_id::text, c.headline, r.reason, r.created_at::text
      FROM review_queue r LEFT JOIN story_clusters c ON c.id = r.cluster_id
      WHERE r.decision IS NULL AND r.created_at > now() - interval '48 hours'
      ORDER BY r.created_at DESC LIMIT 12`,
  )
  const sources = await q<{ name: string; last_polled_at: string | null; enabled: boolean; n: string }>(
    payload,
    sql`SELECT s.name, s.last_polled_at::text, s.enabled, count(i.id) AS n
      FROM sources s LEFT JOIN source_items i ON i.source_id = s.id AND i.created_at > now() - interval '24 hours'
      WHERE s.enabled GROUP BY s.id ORDER BY n DESC`,
  )
  const [pending] = await q<{ n: string }>(payload, sql`SELECT count(*) AS n FROM zaviya_commands WHERE done_at IS NULL`)
  const learningRows = await q<{ key: string; value: unknown }>(
    payload,
    sql`SELECT key, value FROM zaviya_learning WHERE key IN ('category_weights', 'gsc_top_queries')`,
  )
  const learned = Object.fromEntries(learningRows.map((r) => [r.key, r.value])) as {
    category_weights?: Record<string, number>
    gsc_top_queries?: { rows: { query: string; clicks: number; impressions: number }[] }
  }

  const socialCounts = await q<{ platform: string; status: string; n: string }>(
    payload,
    sql`SELECT platform::text AS platform, status::text AS status, count(*) AS n FROM social_posts
      WHERE created_at > now() - interval '24 hours' GROUP BY 1, 2`,
  )
  const socialFailures = await q<{ platform: string; error: string | null; at: string }>(
    payload,
    sql`SELECT platform::text AS platform, error, updated_at::text AS at FROM social_posts
      WHERE status = 'failed' AND updated_at > now() - interval '24 hours' ORDER BY updated_at DESC LIMIT 6`,
  )
  const platformNames = [...new Set(['x', 'facebook', 'instagram', ...socialCounts.map((r) => r.platform)])]

  const settings = (await payload.findGlobal({ slug: 'settings', overrideAccess: true })) as {
    killSwitch?: boolean
    lastHeartbeat?: string | null
    lastHeartbeatMeta?: {
      paused?: boolean
      queues?: ControlRoomData['worker']['queues']
      integrations?: ControlRoomData['worker']['integrations']
      trends?: { items: { name: string; traffic?: string }[] } | null
      xTrends?: { items: { name: string; traffic?: string }[] } | null
      geminiCooldowns?: Record<string, string>
    } | null
  }
  const meta = settings.lastHeartbeatMeta ?? {}
  const lastHeartbeat = settings.lastHeartbeat ?? null

  return {
    generatedAt: new Date().toISOString(),
    traffic: {
      liveVisitors: num(live?.n),
      today: { pageviews: num(windows?.pv_today), visitors: num(windows?.uv_today) },
      yesterday: { pageviews: num(windows?.pv_yday), visitors: num(windows?.uv_yday) },
      last7: { pageviews: num(windows?.pv_7), visitors: num(windows?.uv_7) },
      last30: { pageviews: num(windows?.pv_30), visitors: num(windows?.uv_30) },
      daily: daily.map((d) => ({ day: d.day, pageviews: num(d.pv), visitors: num(d.uv), search: num(d.search) })),
      sourcesToday: sourcesToday.map((s) => ({ source: s.source, pageviews: num(s.pv) })),
      sources7: sources7.map((s) => ({ source: s.source, pageviews: num(s.pv) })),
      devices7: devices7.map((s) => ({ device: s.device, pageviews: num(s.pv) })),
      topPagesToday: topPages.map((p) => ({
        path: p.path,
        title: titleByPath.get(p.path),
        pageviews: num(p.pv),
        sources: pageSources.filter((r) => r.path === p.path).map((r) => ({ source: r.source, pageviews: num(r.pv) })),
      })),
      firstSearchVisit: firstSearch?.ts ?? null,
      searchVisits7: num(windows?.search_7),
    },
    content: {
      publishedToday: today.totalDocs,
      published7: week.totalDocs,
      publishedTotal: total.totalDocs,
      latest: latestRows,
    },
    pipeline: {
      clusters24h: clusters24h.map((c) => ({ status: c.status, count: num(c.n) })),
      items24h: num(items24h?.n),
      reviews: reviews.map((r) => ({
        id: r.id,
        clusterId: r.cluster_id,
        headline: r.headline ?? `Cluster ${r.cluster_id}`,
        reason: r.reason,
        createdAt: r.created_at,
      })),
      sources: sources.map((s) => ({ name: s.name, lastPolledAt: s.last_polled_at, enabled: s.enabled, items24h: num(s.n) })),
    },
    worker: {
      lastHeartbeat,
      online: Boolean(lastHeartbeat && Date.now() - new Date(lastHeartbeat).getTime() < 3 * 60_000),
      killSwitch: Boolean(settings.killSwitch),
      paused: Boolean(meta.paused),
      integrations: meta.integrations ?? {},
      queues: meta.queues ?? {},
      trends: meta.trends?.items ?? [],
      xTrends: meta.xTrends?.items ?? [],
      pendingCommands: num(pending?.n),
      geminiCooldowns: meta.geminiCooldowns ?? {},
    },
    social: {
      platforms: platformNames.map((platform) => ({
        platform,
        posted: num(socialCounts.find((r) => r.platform === platform && r.status === 'posted')?.n),
        failed: num(socialCounts.find((r) => r.platform === platform && r.status === 'failed')?.n),
      })),
      recentFailures: socialFailures.map((r) => ({ platform: r.platform, error: r.error ?? 'no reason recorded', at: r.at })),
    },
    learning: {
      categoryWeights: learned.category_weights ?? {},
      topQueries: learned.gsc_top_queries?.rows ?? [],
      gscConnected: Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON && process.env.GSC_SITE_URL),
    },
  }
}

