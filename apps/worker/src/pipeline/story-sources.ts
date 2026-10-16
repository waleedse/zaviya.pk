/** A cluster this large is a pile of unrelated items, not one story (ZAV-30). */
export const MAX_CLUSTER_ITEMS = 60

/** Most sources one article cites; the writer sees exactly these. */
export const MAX_STORY_SOURCES = 8

/** Best sources first (lowest trust tier, then newest), de-duplicated by URL and capped. */
export function selectStorySources<T extends { url: string; publishedAt?: string | null; source: { trustTier: number } }>(
  items: T[],
  max = MAX_STORY_SOURCES,
): T[] {
  const seen = new Set<string>()
  const ranked = [...items].sort(
    (a, b) =>
      a.source.trustTier - b.source.trustTier ||
      new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime(),
  )
  const out: T[] = []
  for (const it of ranked) {
    if (seen.has(it.url)) continue
    seen.add(it.url)
    out.push(it)
    if (out.length >= max) break
  }
  return out
}
