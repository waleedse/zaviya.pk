import type { MetadataRoute } from 'next'
import { DATA_PAGES, CATEGORIES } from '@zaviya/shared'
import { getPayloadClient } from '@/lib/payload'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayloadClient()
  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
    { url: `${siteUrl}/ur`, lastModified: new Date(), changeFrequency: 'hourly', priority: 1 },
  ]

  for (const c of CATEGORIES) {
    entries.push({
      url: `${siteUrl}/${c.slug}`,
      changeFrequency: 'hourly',
      priority: 0.8,
    })
    entries.push({
      url: `${siteUrl}/ur/${c.slug}`,
      changeFrequency: 'hourly',
      priority: 0.8,
    })
  }

  for (const d of DATA_PAGES) {
    entries.push({
      url: `${siteUrl}/${d.slug}`,
      changeFrequency: 'daily',
      priority: 0.9,
    })
  }

  const pages = await payload.find({ collection: 'pages', limit: 50, depth: 0 })
  for (const p of pages.docs) {
    entries.push({ url: `${siteUrl}/p/${p.slug}`, changeFrequency: 'monthly', priority: 0.5 })
    entries.push({ url: `${siteUrl}/ur/p/${p.slug}`, changeFrequency: 'monthly', priority: 0.5 })
  }

  const articles = await payload.find({
    collection: 'articles',
    where: {
      and: [{ _status: { equals: 'published' } }, { workflow: { not_equals: 'retracted' } }],
    },
    locale: 'all',
    limit: 5000,
    depth: 1,
    overrideAccess: true,
  })

  for (const a of articles.docs) {
    const cat = typeof a.category === 'object' && a.category ? (a.category as { slug: string }).slug : 'news'
    const slug = a.slug as Record<string, string> | string | undefined
    const enSlug = typeof slug === 'object' ? slug.en : typeof slug === 'string' ? slug : undefined
    const urSlug = typeof slug === 'object' ? slug.ur : undefined
    const lastMod = a.updatedAt ?? a.publishedAt ?? new Date()
    if (enSlug) {
      entries.push({
        url: `${siteUrl}/${cat}/${enSlug}`,
        lastModified: lastMod,
        changeFrequency: 'daily',
        priority: 0.7,
        alternates: {
          languages: {
            en: `${siteUrl}/${cat}/${enSlug}`,
            ...(urSlug ? { ur: `${siteUrl}/ur/${cat}/${urSlug}` } : {}),
            'x-default': `${siteUrl}/${cat}/${enSlug}`,
          },
        },
      })
    }
    if (urSlug) {
      entries.push({
        url: `${siteUrl}/ur/${cat}/${urSlug}`,
        lastModified: lastMod,
        changeFrequency: 'daily',
        priority: 0.7,
      })
    }
  }

  return entries
}
