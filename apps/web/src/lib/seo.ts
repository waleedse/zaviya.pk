import { DATA_PAGES, SITE, type Locale } from '@zaviya/shared'
import type { ArticleCard, ArticleFull, FAQ } from '@zaviya/shared'
import type { Metadata } from 'next'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zaviya.pk'

export function absoluteUrl(path: string): string {
  const base = siteUrl().replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export function localePublicPath(locale: Locale, path: string): string {
  const clean = path.replace(/^\//, '')
  if (locale === 'ur') return clean ? `/ur/${clean}` : '/ur'
  return clean ? `/${clean}` : '/'
}

export function hreflangAlternates(enPath: string, urPath?: string): Metadata['alternates'] {
  const en = absoluteUrl(enPath)
  const ur = absoluteUrl(urPath ?? `/ur${enPath === '/' ? '' : enPath}`)
  return {
    canonical: en,
    languages: {
      en,
      ur,
      'x-default': en,
    },
  }
}

export function baseRobots(): Metadata['robots'] {
  return { index: true, follow: true, 'max-image-preview': 'large' }
}

export function buildPageMetadata(opts: {
  locale: Locale
  title: string
  description?: string
  path: string
  urPath?: string
  ogImage?: string
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  noindex?: boolean
}): Metadata {
  const { locale, title, description, path, urPath, ogImage, type = 'website', publishedTime, modifiedTime, noindex } = opts
  const enPath = locale === 'en' ? path : path.replace(/^\/ur/, '') || '/'
  const canonicalPath = locale === 'ur' ? (urPath ?? path) : enPath
  const url = absoluteUrl(canonicalPath)

  return {
    title,
    description,
    alternates: hreflangAlternates(enPath, urPath),
    robots: noindex ? { index: false, follow: false } : baseRobots(),
    openGraph: {
      title,
      description,
      url,
      siteName: SITE.name,
      locale: locale === 'ur' ? 'ur_PK' : 'en_PK',
      type,
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export function articleOgUrl(article: ArticleCard): string {
  const params = new URLSearchParams({
    title: article.title.slice(0, 120),
    kicker: article.category.name,
    category: article.category.slug,
  })
  return absoluteUrl(`/api/og?${params.toString()}`)
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE.name,
    url: siteUrl(),
    logo: absoluteUrl('/icon.svg'),
    sameAs: [],
  }
}

export function websiteJsonLd(locale: Locale) {
  const prefix = locale === 'ur' ? '/ur' : ''
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: absoluteUrl(prefix || '/'),
    potentialAction: {
      '@type': 'SearchAction',
      target: absoluteUrl(`${prefix}/search?q={search_term_string}`),
      'query-input': 'required name=search_term_string',
    },
  }
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  }
}

export function newsArticleJsonLd(article: ArticleFull, locale: Locale) {
  const path = article.href.replace(/^\/ur/, '') || article.href
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.dek,
    image: article.image?.url ? [article.image.url] : [],
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    author: {
      '@type': 'Person',
      name: article.author.name,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: absoluteUrl('/icon.svg') },
    },
    mainEntityOfPage: absoluteUrl(locale === 'ur' ? article.href : path),
  }
}

export function liveBlogJsonLd(article: ArticleFull) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LiveBlogPosting',
    headline: article.title,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    liveBlogUpdate: article.updates.map((u) => ({
      '@type': 'BlogPosting',
      datePublished: u.at,
      articleBody: u.text,
    })),
  }
}

export function faqJsonLd(faqs: FAQ[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

export function dataPageSlugToKey(slug: string): (typeof DATA_PAGES)[number]['key'] | null {
  return DATA_PAGES.find((d) => d.slug === slug)?.key ?? null
}
