import type { MetadataRoute } from 'next'
import { DATA_PAGES, CATEGORIES } from '@zaviya/shared'
import { getPayloadClient } from '@/lib/payload'
import { siteUrl as getSiteUrl } from '@/lib/seo'
import { urduEnabled } from '@/lib/i18n'
import { PK_CITIES } from '@/lib/prayer-times'

export const revalidate = 600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const payload = await getPayloadClient()
  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'hourly', priority: 1 },
    { url: `${siteUrl}/ur`, changeFrequency: 'hourly', priority: 1 },
  ]

  for (const c of CATEGORIES) {
    const languages = { en: `${siteUrl}/${c.slug}`, ur: `${siteUrl}/ur/${c.slug}` }
    entries.push({ url: languages.en, changeFrequency: 'hourly', priority: 0.8, alternates: { languages } })
    entries.push({ url: languages.ur, changeFrequency: 'hourly', priority: 0.8, alternates: { languages } })
  }

  for (const d of DATA_PAGES) {
    entries.push({
      url: `${siteUrl}/${d.slug}`,
      changeFrequency: 'daily',
      priority: 0.9,
    })
  }

  // Daily tools: namaz timings for every city and the baby names finder.
  entries.push({ url: `${siteUrl}/namaz-timings`, changeFrequency: 'daily', priority: 0.9 })
  for (const c of PK_CITIES.slice(1)) {
    entries.push({ url: `${siteUrl}/namaz-timings/${c.slug}`, changeFrequency: 'daily', priority: 0.8 })
  }
  entries.push({ url: `${siteUrl}/baby-names`, changeFrequency: 'weekly', priority: 0.8 })
  entries.push({ url: `${siteUrl}/prize-bond-schedule`, changeFrequency: 'weekly', priority: 0.8 })
  entries.push({ url: `${siteUrl}/passport-fee-pakistan`, changeFrequency: 'weekly', priority: 0.9 })
  entries.push({ url: `${siteUrl}/atl-filer-status-check-pakistan`, changeFrequency: 'monthly', priority: 0.8 })
  entries.push({ url: `${siteUrl}/sbp-policy-rate`, changeFrequency: 'daily', priority: 0.9 })
  entries.push({ url: `${siteUrl}/income-tax-return-deadline-pakistan`, changeFrequency: 'daily', priority: 0.9 })
  entries.push({ url: `${siteUrl}/aqi-today-pakistan`, changeFrequency: 'hourly', priority: 0.9 })
  entries.push({ url: `${siteUrl}/riyal-dirham-rate-pakistan`, changeFrequency: 'daily', priority: 0.9 })
  entries.push({ url: `${siteUrl}/latest`, changeFrequency: 'hourly', priority: 0.8 })
  entries.push({ url: `${siteUrl}/widgets`, changeFrequency: 'monthly', priority: 0.6 })

  entries.push({ url: `${siteUrl}/about`, changeFrequency: 'monthly', priority: 0.7 })
  entries.push({ url: `${siteUrl}/ur/about`, changeFrequency: 'monthly', priority: 0.5 })

  const pages = await payload.find({ collection: 'pages', limit: 50, depth: 0 })
  // /p/about redirects to /about, so it stays out of the sitemap
  for (const p of pages.docs.filter((d) => d.slug !== 'about')) {
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
        alternates: {
          languages: {
            ur: `${siteUrl}/ur/${cat}/${urSlug}`,
            ...(enSlug ? { en: `${siteUrl}/${cat}/${enSlug}` } : {}),
          },
        },
      })
    }
  }

  // lastmod of hubs = newest article change (a lastmod of "now" on every fetch is ignored by Google)
  const hubMod = articles.docs.reduce<string | undefined>((m, a) => {
    const t = (a.updatedAt ?? a.publishedAt) as string | undefined
    return t && (!m || t > m) ? t : m
  }, undefined)
  if (hubMod) {
    const hubs = new Set([siteUrl, `${siteUrl}/ur`, ...CATEGORIES.flatMap((c) => [`${siteUrl}/${c.slug}`, `${siteUrl}/ur/${c.slug}`])])
    for (const e of entries) if (hubs.has(e.url)) e.lastModified = hubMod
  }

  if (urduEnabled()) return entries
  // English-only mode: list English URLs only, without Urdu alternates.
  return entries
    .filter((e) => !e.url.startsWith(`${siteUrl}/ur`))
    .map((e) => (e.alternates ? { ...e, alternates: undefined } : e))
}
