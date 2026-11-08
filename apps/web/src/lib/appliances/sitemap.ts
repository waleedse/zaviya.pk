import type { MetadataRoute } from 'next'
import { getAppliances } from './queries'
import { MIN_INDEXABLE_APPLIANCE_LIST, applianceIndexable, categorySummaries, comparePairs, sitemapItems } from './logic'

type Entry = MetadataRoute.Sitemap[number]

/** Sitemap entries for /prices: hubs, brand lists, the most searched items and compares; a failure never takes the whole sitemap down. */
export async function applianceSitemapEntries(siteUrl: string): Promise<Entry[]> {
  try {
    const all = await getAppliances()
    if (!all.length) return []
    const newest = all.reduce<string | undefined>((m, a) => {
      const t = a.priceUpdatedAt ?? a.updatedAt
      return t && (!m || t > m) ? t : m
    }, undefined)
    const entries: Entry[] = [{ url: `${siteUrl}/prices`, lastModified: newest, changeFrequency: 'daily', priority: 0.9 }]
    for (const s of categorySummaries(all)) {
      if (s.priced < MIN_INDEXABLE_APPLIANCE_LIST) continue
      entries.push({ url: `${siteUrl}/prices/${s.category.slug}`, lastModified: newest, changeFrequency: 'daily', priority: 0.8 })
      // brand lists exist for brands, not for a statistics source (PBS)
      for (const brand of new Set(all.filter((a) => a.category.slug === s.category.slug && a.brand.kind !== 'source').map((a) => a.brand.slug))) {
        const priced = all.filter((a) => a.category.slug === s.category.slug && a.brand.slug === brand && applianceIndexable(a)).length
        if (priced >= MIN_INDEXABLE_APPLIANCE_LIST) entries.push({ url: `${siteUrl}/prices/${s.category.slug}/${brand}`, lastModified: newest, changeFrequency: 'daily', priority: 0.7 })
      }
    }
    // only the searched items; every other priced page stays live and linked from its hub
    for (const a of sitemapItems(all)) {
      entries.push({ url: `${siteUrl}/prices/${a.category.slug}/${a.slug}`, lastModified: a.priceUpdatedAt ?? a.updatedAt, changeFrequency: a.category.group === 'groceries' ? 'weekly' : 'daily', priority: a.hotScore > 0 ? 0.8 : 0.7 })
    }
    for (const p of comparePairs(all, 30)) entries.push({ url: `${siteUrl}/prices/compare/${p.key}`, lastModified: newest, changeFrequency: 'weekly', priority: 0.5 })
    return entries
  } catch (err) {
    console.error('appliance sitemap failed', err)
    return []
  }
}
