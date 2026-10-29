import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { pickClusterHeadline } from '@zaviya/shared'
import { embeddingToPgVector } from './helpers'

export type ClusterMatchInput = {
  sourceItemId: string
  embedding: number[]
  windowHours?: number
  threshold?: number
}

export type ClusterMatchResult = {
  clusterId: string
  isNew: boolean
  similarity: number
}

/**
 * A cluster stops absorbing new items once it is old (by first sighting, not last), otherwise a
 * recurring story (daily fuel rates) keeps refreshing lastSeenAt and swallows every new day into
 * one cluster. Rejected clusters stop absorbing sooner: the editor already said no to that story.
 */
export const MAX_CLUSTER_AGE_HOURS = 72
export const MAX_REJECTED_CLUSTER_AGE_HOURS = 6

export function clusterMatchCutoffs(now: number): { anyFirstSeen: string; rejectedFirstSeen: string } {
  return {
    anyFirstSeen: new Date(now - MAX_CLUSTER_AGE_HOURS * 3600_000).toISOString(),
    rejectedFirstSeen: new Date(now - MAX_REJECTED_CLUSTER_AGE_HOURS * 3600_000).toISOString(),
  }
}

/**
 * Same rule as the SQL filter in runClusterMatch, kept as a pure function so it can be tested.
 * An editor-rejected cluster only absorbs early stragglers (first sighting within
 * MAX_REJECTED_CLUSTER_AGE_HOURS). A later verdict/new development (ZAV-252: ATC sentence landing
 * in a cluster rejected as 'soft politics') then starts a fresh cluster and is pitched on its own.
 */
export function clusterAcceptsItems(
  cluster: { status?: string | null; firstSeenAt: string },
  now: number,
): boolean {
  const c = clusterMatchCutoffs(now)
  if (cluster.firstSeenAt < c.anyFirstSeen) return false
  if (cluster.status === 'rejected' && cluster.firstSeenAt < c.rejectedFirstSeen) return false
  return true
}

/** maxTier = best (most trusted) source tier in cluster — numerically minimum (1 beats 3). */
export async function refreshClusterStats(payload: Payload, clusterId: string): Promise<void> {
  const items = await payload.find({
    collection: 'source-items',
    where: { cluster: { equals: clusterId } },
    depth: 1,
    limit: 500,
    overrideAccess: true,
  })
  const sourceIds = new Set<string>()
  let maxTier = 3
  const candidates: { title: string; tier: number }[] = []
  for (const item of items.docs) {
    const src = item.source
    const id = typeof src === 'object' && src !== null ? String(src.id) : String(src)
    sourceIds.add(id)
    const tier =
      typeof src === 'object' && src !== null && 'trustTier' in src
        ? Number((src as { trustTier: number }).trustTier)
        : 3
    maxTier = Math.min(maxTier, tier)
    if (item.title) candidates.push({ title: String(item.title), tier })
  }
  const current = await payload.findByID({ collection: 'story-clusters', id: clusterId, depth: 0, overrideAccess: true })
  const headline = pickClusterHeadline(candidates, String(current.headline ?? ''))
  const lastSeen = items.docs.reduce((max, it) => {
    const t = it.publishedAt ? new Date(it.publishedAt).getTime() : 0
    return Math.max(max, t)
  }, 0)
  await payload.update({
    collection: 'story-clusters',
    id: clusterId,
    data: {
      itemCount: items.docs.length,
      distinctSources: sourceIds.size,
      maxTier,
      ...(headline && headline !== current.headline ? { headline } : {}),
      lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : new Date().toISOString(),
    },
    overrideAccess: true,
  })
}

export async function runClusterMatch(
  payload: Payload,
  input: ClusterMatchInput,
): Promise<ClusterMatchResult> {
  const { sourceItemId, embedding, windowHours = 48, threshold = 0.83 } = input
  if (embedding.length !== 768) {
    throw new Error('embedding must have 768 dimensions')
  }

  const vectorLiteral = embeddingToPgVector(embedding)
  const drizzle = payload.db.drizzle

  await drizzle.execute(sql`
    UPDATE source_items
    SET embedding = ${vectorLiteral}::vector
    WHERE id = ${sourceItemId}
  `)

  const windowStart = new Date(Date.now() - windowHours * 3600_000).toISOString()
  const cutoffs = clusterMatchCutoffs(Date.now())

  const matchResult = await drizzle.execute(sql`
    SELECT
      si.cluster_id AS cluster_id,
      1 - (si.embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM source_items si
    INNER JOIN story_clusters sc ON sc.id = si.cluster_id
    WHERE si.id != ${sourceItemId}
      AND si.embedding IS NOT NULL
      AND si.cluster_id IS NOT NULL
      AND sc.last_seen_at >= ${windowStart}
      AND sc.first_seen_at >= ${cutoffs.anyFirstSeen}
      AND (sc.status IS DISTINCT FROM 'rejected' OR sc.first_seen_at >= ${cutoffs.rejectedFirstSeen})
    ORDER BY si.embedding <=> ${vectorLiteral}::vector
    LIMIT 1
  `)

  const rows = matchResult.rows as { cluster_id: string; similarity: number }[]
  const best = rows[0]
  const similarity = best ? Number(best.similarity) : 0

  if (best?.cluster_id && similarity >= threshold) {
    const clusterId = String(best.cluster_id)
    await payload.update({
      collection: 'source-items',
      id: sourceItemId,
      data: { cluster: Number(clusterId) },
      overrideAccess: true,
    })
    await refreshClusterStats(payload, clusterId)
    return { clusterId, isNew: false, similarity }
  }

  const item = await payload.findByID({
    collection: 'source-items',
    id: sourceItemId,
    depth: 0,
    overrideAccess: true,
  })
  const sourceId = typeof item.source === 'object' ? String(item.source.id) : String(item.source)
  const src = await payload.findByID({
    collection: 'sources',
    id: sourceId,
    depth: 0,
    overrideAccess: true,
  })
  const now = new Date().toISOString()
  const cluster = await payload.create({
    collection: 'story-clusters',
    data: {
      headline: item.title,
      firstSeenAt: item.publishedAt ?? now,
      lastSeenAt: item.publishedAt ?? now,
      itemCount: 1,
      distinctSources: 1,
      maxTier: src.trustTier ?? 3,
      status: 'new',
    },
    overrideAccess: true,
  })
  await payload.update({
    collection: 'source-items',
    id: sourceItemId,
    data: { cluster: Number(cluster.id) },
    overrideAccess: true,
  })
  return { clusterId: String(cluster.id), isNew: true, similarity: 0 }
}
