import { DATA_PAGES, SITE, type Locale } from '@zaviya/shared'
import type { ArticleCard, ArticleFull, FAQ } from '@zaviya/shared'
import type { Metadata } from 'next'
import { urduEnabled } from './i18n'

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zaviya.pk').replace(/\/$/, '')

export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${siteUrl()}${p === '/' ? '' : p}` || siteUrl()
}

export function localePublicPath(locale: Locale, path: string): string {
  const clean = path.replace(/^\//, '')
  if (locale === 'ur') return clean ? `/ur/${clean}` : '/ur'
  return clean ? `/${clean}` : '/'
}

/** Canonical points at the page's own locale; hreflang lists only versions that exist. */
export function hreflangAlternates(locale: Locale, enPath?: string, urPath?: string): Metadata['alternates'] {
  const en = enPath ? absoluteUrl(enPath) : undefined
  const ur = urPath ? absoluteUrl(urPath) : undefined
  const canonical = (locale === 'ur' ? ur : en) ?? en ?? ur
  const languages: Record<string, string> = {}
  if (en) languages.en = en
  if (ur) languages.ur = ur
  if (en || ur) languages['x-default'] = (en ?? ur)!
  return { canonical, languages }
}

export function baseRobots(): Metadata['robots'] {
  return {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  }
}

export function buildPageMetadata(opts: {
  locale: Locale
  title: string
  description?: string
  /** English URL path, if an English version exists */
  enPath?: string
  /** Urdu URL path, if an Urdu version exists */
  urPath?: string
  ogImage?: string
  /** Real size of ogImage when it is a photo (the generated card is 1200x630) */
  ogImageSize?: { width: number; height: number }
  /** Search keywords: the article's tags and section */
  keywords?: string[]
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  section?: string
  tags?: string[]
  noindex?: boolean
  /** Use the title as-is, without the "| Zaviya" template */
  absoluteTitle?: boolean
}): Metadata {
  const { locale, title, description, enPath, ogImage, type = 'website', publishedTime, modifiedTime } = opts
  // English-only mode: English pages don't advertise Urdu versions, and Urdu pages stay out of Google.
  const urPath = urduEnabled() || locale === 'ur' ? opts.urPath : undefined
  const noindex = opts.noindex || (locale === 'ur' && !urduEnabled())
  const alternates = hreflangAlternates(locale, enPath, urPath)
  const url = alternates?.canonical as string | undefined
  const image = ogImage?.startsWith('/') ? absoluteUrl(ogImage) : ogImage ?? absoluteUrl(`/api/og?${new URLSearchParams({ title: title.slice(0, 120) }).toString()}`)

  return {
    // Long headlines skip the " | Zaviya" suffix so Google shows them whole (~60 chars).
    title: opts.absoluteTitle || title.length > 52 ? { absolute: title } : title,
    description,
    ...(opts.keywords?.length ? { keywords: opts.keywords } : {}),
    alternates,
    robots: noindex ? { index: false, follow: true } : baseRobots(),
    openGraph: {
      title,
      description,
      url,
      siteName: locale === 'ur' ? SITE.nameUr : SITE.name,
      locale: locale === 'ur' ? 'ur_PK' : 'en_PK',
      alternateLocale: locale === 'ur' ? ['en_PK'] : ['ur_PK'],
      type,
      images: [{ url: image, width: opts.ogImageSize?.width ?? 1200, height: opts.ogImageSize?.height ?? 630, alt: title }],
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
      ...(opts.section ? { section: opts.section } : {}),
      ...(opts.tags?.length ? { tags: opts.tags } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

/** Search-intent titles and descriptions for section fronts. */
export const SECTION_SEO: Record<string, { en: { title: string; description: string }; ur: { title: string; description: string } }> = {
  home: {
    en: {
      title: 'Zaviya News: Latest Pakistan News Today in English & Urdu',
      description:
        'Latest Pakistan news today: breaking stories, politics, business, cricket, petrol, gold and dollar rates, explained clearly in English and Urdu by Zaviya.',
    },
    ur: {
      title: 'زاویہ: پاکستان کی تازہ ترین خبریں، بریکنگ نیوز اردو میں',
      description:
        'پاکستان کی آج کی تازہ ترین خبریں، سیاست، کاروبار، کرکٹ، پیٹرول، سونے اور ڈالر کے ریٹ، آسان اردو میں۔',
    },
  },
  pakistan: {
    en: { title: 'Pakistan News Today: Politics, Government & National Updates', description: 'Latest Pakistan news: government decisions, politics, courts, provinces and national developments, with sources and what it means for you.' },
    ur: { title: 'پاکستان کی خبریں: سیاست، حکومت اور قومی خبریں', description: 'پاکستان کی تازہ ترین خبریں: حکومتی فیصلے، سیاست، عدالتیں اور صوبائی خبریں، ذرائع کے ساتھ۔' },
  },
  world: {
    en: { title: 'World News: International Stories That Matter to Pakistan', description: 'International news explained from a Pakistani angle: US, China, Middle East, Afghanistan, India and global markets.' },
    ur: { title: 'عالمی خبریں: دنیا بھر کی اہم خبریں', description: 'دنیا بھر کی اہم خبریں پاکستانی زاویے سے: امریکہ، چین، مشرق وسطیٰ، افغانستان اور بھارت۔' },
  },
  business: {
    en: { title: 'Business News Pakistan: Economy, SBP, Stocks, Petrol & Gold', description: 'Pakistan business and economy news: SBP policy rate, PSX, IMF, petrol prices, gold and dollar rates, budget and taxes.' },
    ur: { title: 'کاروباری خبریں: معیشت، اسٹیٹ بینک، پیٹرول اور سونا', description: 'پاکستان کی معیشت کی خبریں: اسٹیٹ بینک، اسٹاک مارکیٹ، آئی ایم ایف، پیٹرول، سونے اور ڈالر کے ریٹ۔' },
  },
  'tech-telecom': {
    en: { title: 'Tech News Pakistan: PTA, Mobiles, Internet & Startups', description: 'Pakistan technology news: PTA, mobile phones and prices, 5G, internet, freelancing, startups and digital payments.' },
    ur: { title: 'ٹیکنالوجی کی خبریں: پی ٹی اے، موبائل اور انٹرنیٹ', description: 'پاکستان میں ٹیکنالوجی کی خبریں: پی ٹی اے، موبائل فون، فائیو جی، انٹرنیٹ اور فری لانسنگ۔' },
  },
  ai: {
    en: { title: 'AI News: Latest Artificial Intelligence News for Pakistan', description: 'Latest AI news: ChatGPT, Gemini, Claude and new models, AI jobs and skills, AI policy in Pakistan, and how AI changes work and business.' },
    ur: { title: 'مصنوعی ذہانت کی خبریں: اے آئی کی تازہ ترین خبریں', description: 'مصنوعی ذہانت (اے آئی) کی تازہ خبریں: چیٹ جی پی ٹی، جیمنائی، نئے ماڈلز، اے آئی ملازمتیں اور پاکستان میں اے آئی پالیسی۔' },
  },
  autos: {
    en: { title: 'Auto News Pakistan: Car Prices, Bikes, EVs & Launches', description: 'Latest car and bike prices in Pakistan, new launches, EVs, auto financing and industry news.' },
    ur: { title: 'گاڑیوں کی خبریں: قیمتیں، نئی گاڑیاں اور موٹر سائیکل', description: 'پاکستان میں گاڑیوں اور موٹر سائیکلوں کی قیمتیں، نئی لانچز اور آٹو انڈسٹری کی خبریں۔' },
  },
  cricket: {
    en: { title: 'Cricket News: Pakistan Team, PSL, Scores & Schedules', description: 'Pakistan cricket news, PSL updates, match previews, squads, results and schedules.' },
    ur: { title: 'کرکٹ کی خبریں: پاکستان ٹیم، پی ایس ایل اور شیڈول', description: 'پاکستان کرکٹ ٹیم، پی ایس ایل، میچز کے نتائج، اسکواڈ اور شیڈول کی تازہ خبریں۔' },
  },
  'education-jobs': {
    en: { title: 'Education & Jobs Pakistan: Results, Admissions, Govt Jobs', description: 'Board results, admissions, scholarships, government jobs and education policy news in Pakistan.' },
    ur: { title: 'تعلیم و نوکریاں: نتائج، داخلے اور سرکاری نوکریاں', description: 'بورڈ کے نتائج، داخلے، اسکالرشپس، سرکاری نوکریاں اور تعلیمی پالیسی کی خبریں۔' },
  },
  trending: {
    en: { title: 'Trending in Pakistan Today: Viral Stories & Top Searches', description: 'What Pakistan is talking about today: trending topics, viral stories and top searches, explained.' },
    ur: { title: 'پاکستان میں آج کیا ٹرینڈ کر رہا ہے', description: 'پاکستان میں آج کے ٹرینڈنگ موضوعات، وائرل خبریں اور سب سے زیادہ سرچ کی جانے والی خبریں۔' },
  },
}

/** The article's tags first, then its section: for the keywords meta and NewsArticle schema. */
export function articleKeywords(article: ArticleCard & { tags?: { name: string }[] }): string[] {
  const seen = new Set<string>()
  return [...(article.tags ?? []).map((t) => t.name), article.category.name].filter((k) => {
    const key = k.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The share picture: the article's own photo (the generated text card only when it has none). */
export function articleShareImage(article: ArticleCard): { url: string; size?: { width: number; height: number } } {
  if (article.image?.url) return { url: article.image.url, size: { width: article.image.width, height: article.image.height } }
  return { url: articleOgUrl(article) }
}

export function articleOgUrl(article: ArticleCard): string {
  const params = new URLSearchParams({
    title: article.title.slice(0, 120),
    kicker: article.category.name,
    category: article.category.slug,
  })
  return absoluteUrl(`/api/og?${params.toString()}`)
}

/** Publisher logo: a raster PNG (Google rejects SVG logos); lives in public/logo.png. */
export function logoUrl(): string {
  return absoluteUrl('/logo.png')
}

/** One stable id for the brand: Organization, WebSite and AboutPage all point at it (ZAV-100). */
export function organizationId(): string {
  return `${siteUrl()}/#organization`
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    '@id': organizationId(),
    name: SITE.name,
    url: siteUrl(),
    alternateName: ['Zaviya News', 'Zaviya.pk', 'زاویہ'],
    description: 'Zaviya (zaviya.pk) is a Pakistani digital newsroom publishing the latest Pakistan news, business, cricket, jobs and daily gold, dollar and petrol rates in English and Urdu.',
    foundingDate: '2026',
    areaServed: { '@type': 'Country', name: 'Pakistan' },
    inLanguage: ['en', 'ur'],
    logo: { '@type': 'ImageObject', url: logoUrl(), width: 512, height: 512 },
    publishingPrinciples: absoluteUrl('/p/editorial-policy'),
    ethicsPolicy: absoluteUrl('/p/editorial-policy'),
    correctionsPolicy: absoluteUrl('/p/corrections'),
    contactPoint: { '@type': 'ContactPoint', contactType: 'editorial', url: absoluteUrl('/p/contact'), availableLanguage: ['English', 'Urdu'] },
    // Official profiles only (comma-separated in SOCIAL_PROFILE_URLS); they tie the brand together for Google
    sameAs: (process.env.SOCIAL_PROFILE_URLS ?? '').split(',').map((u) => u.trim()).filter((u) => /^https:\/\//.test(u)),
  }
}

export function websiteJsonLd(locale: Locale) {
  const prefix = locale === 'ur' ? '/ur' : ''
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    // Google reads the site name shown in results from here
    alternateName: ['Zaviya News', 'Zaviya.pk'],
    url: absoluteUrl(prefix || '/'),
    publisher: { '@id': organizationId() },
    potentialAction: {
      '@type': 'SearchAction',
      target: absoluteUrl(`${prefix}/search?q={search_term_string}`),
      'query-input': 'required name=search_term_string',
    },
  }
}

export function aboutPageJsonLd(locale: Locale) {
  const prefix = locale === 'ur' ? '/ur' : ''
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    url: absoluteUrl(`${prefix}/p/about`),
    name: 'About Zaviya News',
    about: { '@id': organizationId() },
    publisher: { '@id': organizationId() },
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
    // No hero image: fall back to the generated 1200x630 social card, never an empty list.
    image: [article.image?.url ? (article.image.url.startsWith('/') ? absoluteUrl(article.image.url) : article.image.url) : articleOgUrl(article)],
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    ...(articleKeywords(article).length ? { keywords: articleKeywords(article).join(', ') } : {}),
    articleSection: article.category.name,
    author: {
      '@type': 'Person',
      name: article.author.name,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      logo: { '@type': 'ImageObject', url: logoUrl(), width: 512, height: 512 },
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
