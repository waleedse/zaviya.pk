import type { MetadataRoute } from 'next'
import { OFFER_GROUPS } from '@zaviya/shared'
import { offerGroupSummaries, offerSitemapRows } from './queries'

type Entry = MetadataRoute.Sitemap[number]

/** Store category pages and product pages (fresh, priced, with a picture). Never takes the sitemap down. */
export async function offerSitemapEntries(siteUrl: string): Promise<Entry[]> {
  try {
    const [sums, items] = await Promise.all([offerGroupSummaries(), offerSitemapRows(8000)])
    const out: Entry[] = []
    for (const g of OFFER_GROUPS) {
      const s = sums.find((x) => x.slug === g.slug)
      if (g.slug !== 'other' && s && s.count >= 6) out.push({ url: `${siteUrl}/prices/shop/${g.slug}`, changeFrequency: 'daily', priority: 0.8 })
    }
    for (const it of items) if (it.group !== 'other') out.push({ url: `${siteUrl}/prices/item/${it.slug}`, lastModified: it.updatedAt, changeFrequency: 'daily', priority: 0.5 })
    return out
  } catch (err) {
    console.error('offer sitemap failed', err)
    return []
  }
}
