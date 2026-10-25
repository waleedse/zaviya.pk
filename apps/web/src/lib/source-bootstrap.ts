import type { Payload } from 'payload'

/**
 * Sources added after the first seed (ZAV-212). Created on boot only when the key is missing, so no migration and
 * no overwrite: an editor who disables or retunes one keeps their change. Live cricket was never ingested because
 * the only cricket inputs were Cricket Pakistan and a Google News search (headline-only links).
 */
export const BOOTSTRAP_SOURCES = [
  { key: 'bbc-cricket', name: 'BBC Sport Cricket', url: 'https://feeds.bbci.co.uk/sport/cricket/rss.xml', type: 'rss', trustTier: 2, language: 'en', categoryHint: 'cricket', pollIntervalSec: 180 },
  { key: 'espncricinfo', name: 'ESPNcricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', type: 'rss', trustTier: 2, language: 'en', categoryHint: 'cricket', pollIntervalSec: 180 },
  { key: 'dawn-sport', name: 'Dawn Sport', url: 'https://www.dawn.com/feeds/sport', type: 'rss', trustTier: 2, language: 'en', categoryHint: 'sports', pollIntervalSec: 240 },
  { key: 'geo-sports', name: 'Geo Sports', url: 'https://www.geo.tv/rss/1/6', type: 'rss', trustTier: 2, language: 'en', categoryHint: 'sports', pollIntervalSec: 240 },
] as const

/** Create the missing bootstrap sources. Safe to run on every boot. */
export async function ensureBootstrapSources(payload: Payload): Promise<string[]> {
  const created: string[] = []
  for (const s of BOOTSTRAP_SOURCES) {
    const found = await payload.find({ collection: 'sources', where: { key: { equals: s.key } }, limit: 1, depth: 0 })
    if (found.docs[0]) continue
    await payload.create({ collection: 'sources', data: { ...s, enabled: true, robotsOk: true }, overrideAccess: true })
    created.push(s.key)
  }
  return created
}
