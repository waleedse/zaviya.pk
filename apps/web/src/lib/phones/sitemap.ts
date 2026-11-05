import type { MetadataRoute } from 'next'
import { PRICE_BANDS } from '@zaviya/shared'
import { getBrands, getPhones } from './queries'
import { MIN_INDEXABLE_LIST, bandSlug, phoneIndexable, phonesUnder, popularPairs } from './logic'

type Entry = MetadataRoute.Sitemap[number]

/** Sitemap entries for the mobile section. A failure here must never take the whole sitemap down. */
export async function phoneSitemapEntries(siteUrl: string): Promise<Entry[]> {
  try {
    const [phones, brands] = await Promise.all([getPhones(), getBrands()])
    if (!phones.length) return []
    const newest = phones.reduce<string | undefined>((m, p) => {
      const t = p.priceUpdatedAt ?? p.updatedAt
      return t && (!m || t > m) ? t : m
    }, undefined)
    const entries: Entry[] = [{ url: `${siteUrl}/mobile-prices`, lastModified: newest, changeFrequency: 'daily', priority: 0.9 }]
    for (const b of brands) {
      if (phones.some((p) => p.brand.slug === b.slug)) entries.push({ url: `${siteUrl}/mobile-prices/${b.slug}`, lastModified: newest, changeFrequency: 'daily', priority: 0.8 })
    }
    for (const band of PRICE_BANDS) {
      // thin lists are noindex (see the page) and stay out of the sitemap
      if (phonesUnder(phones, band).length >= MIN_INDEXABLE_LIST) entries.push({ url: `${siteUrl}/mobile-prices/${bandSlug(band)}`, lastModified: newest, changeFrequency: 'daily', priority: 0.8 })
    }
    // Phones with no official price are noindex (thin) and stay out
    for (const p of phones.filter(phoneIndexable)) entries.push({ url: `${siteUrl}/mobile/${p.slug}`, lastModified: p.priceUpdatedAt ?? p.updatedAt, changeFrequency: 'daily', priority: 0.7 })
    const bySlug = new Map(phones.map((p) => [p.slug, p]))
    for (const pair of popularPairs(phones, 60).filter((x) => phoneIndexable(bySlug.get(x.a) ?? {}) && phoneIndexable(bySlug.get(x.b) ?? {}))) entries.push({ url: `${siteUrl}/compare/${pair.key}`, lastModified: newest, changeFrequency: 'weekly', priority: 0.6 })
    return entries
  } catch (err) {
    console.error('phone sitemap failed', err)
    return []
  }
}
