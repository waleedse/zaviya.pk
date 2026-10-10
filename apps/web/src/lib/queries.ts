import 'server-only'
import { cache } from 'react'
import {
  CATEGORIES,
  DATA_PAGES,
  type ArticleCard,
  type ArticleFull,
  type AuthorFull,
  type CategoryRef,
  type CategorySlug,
  type DataPageFull,
  type DataPageKey,
  type HomeFeed,
  type ImageRef,
  type Locale,
  type Paginated,
  type RateTick,
  type RateSeries,
} from '@zaviya/shared'
import { categoryRef, mockArticle, mockCards, mockDataPage, mockRates, articleHref } from './mock'
import { getPayloadClient } from './payload'
import type { Where } from 'payload'
import type { Media, Article, Category, Author, Tag, DataPage, DataPoint } from '../payload-types'

const PAGE_SIZE = 12

const publishedClauses: Where[] = [
  { _status: { equals: 'published' } },
  { workflow: { not_equals: 'retracted' } },
]

function publishedAnd(...extra: Where[]): Where {
  return { and: [...publishedClauses, ...extra] }
}

const publishedWhere: Where = { and: publishedClauses }

function paginate<T>(items: T[], page: number, size = PAGE_SIZE): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const p = Math.min(Math.max(1, page), totalPages)
  return { docs: items.slice((p - 1) * size, p * size), page: p, totalPages, totalDocs: items.length }
}

function mapMedia(m: Media | number | null | undefined, locale: Locale): ImageRef | undefined {
  if (!m || typeof m === 'number') return undefined
  const alt = typeof m.alt === 'string' ? m.alt : (m.alt as Record<string, string> | undefined)?.[locale] ?? ''
  const url = m.url ?? ''
  const sizes = m.sizes
  return {
    url,
    alt,
    width: m.width ?? 1600,
    height: m.height ?? 900,
    credit: m.credit ?? undefined,
    isAiGenerated: m.isAiGenerated ?? undefined,
    sizes: sizes
      ? {
          thumb: sizes.thumb?.url ?? undefined,
          card: sizes.card?.url ?? undefined,
          hero: sizes.hero?.url ?? undefined,
          square: sizes.square?.url ?? undefined,
          portrait: sizes.portrait?.url ?? undefined,
        }
      : undefined,
  }
}

function mapCategory(c: Category | number | null | undefined, locale: Locale): CategoryRef {
  if (!c || typeof c === 'number') return categoryRef('pakistan', locale)
  const slug = c.slug as CategorySlug
  const name =
    typeof c.name === 'string' ? c.name : (c.name as Record<string, string> | undefined)?.[locale] ?? slug
  return { slug, name, color: c.color ?? '#000' }
}

function mapAuthor(a: Author | number | null | undefined, locale: Locale) {
  if (!a || typeof a === 'number') {
    return { slug: 'zaviya-desk', name: locale === 'ur' ? 'زاویہ ڈیسک' : 'Zaviya Desk' }
  }
  return {
    slug: a.slug,
    name: a.name,
    role: a.role ?? undefined,
    avatar: mapMedia(a.avatar as Media | number | null, locale),
  }
}

async function hasPublishedArticles(): Promise<boolean> {
  const payload = await getPayloadClient()
  const r = await payload.find({
    collection: 'articles',
    where: publishedWhere,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return r.totalDocs > 0
}

async function fetchAlternateHref(articleId: string, locale: Locale, categorySlug: string): Promise<string | undefined> {
  const other: Locale = locale === 'en' ? 'ur' : 'en'
  const payload = await getPayloadClient()
  try {
    const doc = await payload.findByID({
      collection: 'articles',
      id: articleId,
      locale: other,
      depth: 0,
      overrideAccess: true,
    })
    const slug = doc.slug
    if (!slug) return undefined
    return articleHref(other, categorySlug, String(slug))
  } catch {
    return undefined
  }
}

function mapArticleCard(doc: Article, locale: Locale, category: CategoryRef): ArticleCard {
  const slug = String(doc.slug ?? '')
  return {
    id: String(doc.id),
    slug,
    locale,
    href: articleHref(locale, category.slug, slug),
    title: String(doc.title ?? ''),
    dek: doc.dek ?? undefined,
    category,
    image: mapMedia(doc.heroImage as Media | number | null, locale),
    author: mapAuthor(doc.author as Author | number | null, locale),
    publishedAt: doc.publishedAt ?? doc.createdAt,
    updatedAt: doc.updatedAt,
    readingTime: doc.readingTime ?? undefined,
    isLive: doc.isLive ?? undefined,
    isBreaking: doc.isBreaking ?? undefined,
    priority: doc.priority ?? undefined,
  }
}

async function mapArticleCardAsync(doc: Article, locale: Locale): Promise<ArticleCard> {
  const category = mapCategory(doc.category as Category, locale)
  const card = mapArticleCard(doc, locale, category)
  card.alternateHref = await fetchAlternateHref(String(doc.id), locale, category.slug)
  return card
}

async function loadPublishedCards(locale: Locale, limit = 100): Promise<ArticleCard[]> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: publishedWhere,
    sort: '-publishedAt',
    limit,
    depth: 2,
    overrideAccess: true,
  })
  return Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
}

export const getCategories = cache(async (locale: Locale): Promise<CategoryRef[]> => {
  const payload = await getPayloadClient()
  const cats = await payload.find({
    collection: 'categories',
    locale,
    sort: 'order',
    limit: 20,
    depth: 0,
  })
  if (cats.docs.length) {
    return cats.docs.map((c) => mapCategory(c, locale))
  }
  return CATEGORIES.map((c) => categoryRef(c.slug, locale))
})

export const getHomeFeed = cache(async (locale: Locale): Promise<HomeFeed> => {
  if (!(await hasPublishedArticles())) {
    const all = mockCards(locale)
    const rails = CATEGORIES.map((c) => ({
      category: categoryRef(c.slug, locale),
      articles: all.filter((a) => a.category.slug === c.slug).slice(0, 4),
    })).filter((r) => r.articles.length > 0)
    return {
      hero: all[0] ?? null,
      secondary: all.slice(1, 4),
      live: all.filter((a) => a.isLive),
      latest: all.slice(0, 12),
      explainers: all.filter((a) => a.category.slug === 'trending' || a.category.slug === 'business').slice(0, 3),
      mostRead: all.slice(3, 13),
      rails,
    }
  }
  const all = await loadPublishedCards(locale, 80)
  const rails = CATEGORIES.map((c) => ({
    category: categoryRef(c.slug, locale),
    articles: all.filter((a) => a.category.slug === c.slug).slice(0, 4),
  })).filter((r) => r.articles.length > 0)
  return {
    hero: all[0] ?? null,
    secondary: all.slice(1, 4),
    live: all.filter((a) => a.isLive),
    latest: all.slice(0, 12),
    explainers: all.filter((a) => a.category.slug === 'trending' || a.category.slug === 'business').slice(0, 3),
    mostRead: all.slice(3, 13),
    rails,
  }
})

async function mapArticleFullFromDoc(doc: Article, locale: Locale): Promise<ArticleFull> {
  const categoryRefObj = mapCategory(doc.category as Category, locale)
  const card = await mapArticleCardAsync(doc, locale)
  const author = mapAuthor(doc.author as Author | number | null, locale)
  const tags = (Array.isArray(doc.tags) ? doc.tags : [])
    .filter((t): t is Tag => typeof t === 'object' && t !== null)
    .map((t) => ({
      slug: t.slug,
      name: typeof t.name === 'string' ? t.name : String(t.name),
    }))
  const updates = (doc.updates ?? []).map((u) => ({
    at: u.at,
    text:
      locale === 'ur'
        ? u.text?.ur ?? u.text?.en ?? ''
        : u.text?.en ?? u.text?.ur ?? '',
  }))
  const corrections = (doc.corrections ?? []).map((c) => ({
    at: c.at,
    note: typeof c.note === 'string' ? c.note : String((c.note as Record<string, string> | undefined)?.[locale] ?? ''),
  }))
  const seoGroup = doc.seo
  const og =
    seoGroup?.ogImage && typeof seoGroup.ogImage === 'object'
      ? (seoGroup.ogImage as Media).url ?? undefined
      : undefined
  return {
    ...card,
    category: categoryRefObj,
    body: doc.body,
    whatItMeans: doc.whatItMeans,
    keyPoints: (doc.keyPoints ?? []).map((k) => k.point ?? '').filter(Boolean),
    faqs: (doc.faqs ?? []).map((f) => ({ q: f.q, a: f.a })),
    sources: (doc.sources ?? []).map((s) => ({
      name: s.name,
      url: s.url,
      tier: s.tier as 1 | 2 | 3,
      publishedAt: s.publishedAt ?? undefined,
    })),
    embeds: (doc.embeds ?? []).map((e) => ({
      type: e.type as 'x' | 'instagram' | 'youtube',
      url: e.url,
    })),
    tags,
    updates,
    corrections,
    author: {
      ...author,
      bio:
        typeof (doc.author as Author)?.bio === 'string'
          ? ((doc.author as Author).bio as string)
          : ((doc.author as Author)?.bio as Record<string, string> | undefined)?.[locale],
    },
    seo: {
      metaTitle: typeof seoGroup?.metaTitle === 'string' ? seoGroup.metaTitle : undefined,
      metaDescription:
        typeof seoGroup?.metaDescription === 'string' ? seoGroup.metaDescription : undefined,
      ogImage: og,
      canonical: typeof seoGroup?.canonical === 'string' ? seoGroup.canonical : undefined,
      noindex: seoGroup?.noindex ?? undefined,
    },
  }
}

export const getArticle = cache(
  async (locale: Locale, category: string, slug: string): Promise<ArticleFull | null> => {
    if (!(await hasPublishedArticles())) {
      const card = mockCards(locale).find((a) => a.slug === slug && a.category.slug === category)
      return card ? mockArticle(card) : null
    }
    const payload = await getPayloadClient()
    const cat = await payload.find({
      collection: 'categories',
      where: { slug: { equals: category } },
      limit: 1,
    })
    const categoryId = cat.docs[0]?.id
    if (!categoryId) return null
    const result = await payload.find({
      collection: 'articles',
      locale,
      where: {
        ...publishedAnd({ slug: { equals: slug } }, { category: { equals: categoryId } }),
      },
      limit: 1,
      depth: 2,
      overrideAccess: true,
    })
    const doc = result.docs[0]
    if (!doc) return null
    return mapArticleFullFromDoc(doc, locale)
  },
)

export const getArticleBySlug = cache(async (locale: Locale, slug: string): Promise<ArticleFull | null> => {
  if (!(await hasPublishedArticles())) {
    const card = mockCards(locale).find((a) => a.slug === slug)
    return card ? mockArticle(card) : null
  }
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: publishedAnd({ slug: { equals: slug } }),
    sort: '-publishedAt',
    limit: 1,
    depth: 2,
    overrideAccess: true,
  })
  const doc = result.docs[0]
  if (!doc) return null
  return mapArticleFullFromDoc(doc, locale)
})

export const getCategoryFeed = cache(
  async (locale: Locale, slug: string, page = 1): Promise<Paginated<ArticleCard> | null> => {
    if (!CATEGORIES.some((c) => c.slug === slug)) return null
    if (!(await hasPublishedArticles())) {
      return paginate(mockCards(locale).filter((a) => a.category.slug === (slug as CategorySlug)), page)
    }
    const payload = await getPayloadClient()
    const cat = await payload.find({
      collection: 'categories',
      where: { slug: { equals: slug } },
      limit: 1,
    })
    if (!cat.docs[0]) return paginate([], page)
    const result = await payload.find({
      collection: 'articles',
      locale,
      where: {
        ...publishedAnd({ category: { equals: cat.docs[0].id } }),
      },
      sort: '-publishedAt',
      page,
      limit: PAGE_SIZE,
      depth: 2,
      overrideAccess: true,
    })
    const docs = await Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
    return {
      docs,
      page: result.page ?? page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    }
  },
)

export const getTagFeed = cache(
  async (
    locale: Locale,
    slug: string,
    page = 1,
  ): Promise<{ tag: { slug: string; name: string }; feed: Paginated<ArticleCard> } | null> => {
    const payload = await getPayloadClient()
    const tagRes = await payload.find({
      collection: 'tags',
      locale,
      where: { slug: { equals: slug } },
      limit: 1,
    })
    const tagDoc = tagRes.docs[0]
    const tagName = tagDoc
      ? typeof tagDoc.name === 'string'
        ? tagDoc.name
        : slug
      : slug
    if (!(await hasPublishedArticles())) {
      return { tag: { slug, name: tagName }, feed: paginate(mockCards(locale), page) }
    }
    if (!tagDoc) return { tag: { slug, name: tagName }, feed: paginate([], page) }
    const result = await payload.find({
      collection: 'articles',
      locale,
      where: {
        ...publishedAnd({ tags: { contains: tagDoc.id } }),
      },
      sort: '-publishedAt',
      page,
      limit: PAGE_SIZE,
      depth: 2,
      overrideAccess: true,
    })
    const docs = await Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
    return {
      tag: { slug, name: tagName },
      feed: {
        docs,
        page: result.page ?? page,
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
      },
    }
  },
)

export const getAuthor = cache(async (locale: Locale, slug: string, page = 1): Promise<AuthorFull | null> => {
  const payload = await getPayloadClient()
  const authors = await payload.find({
    collection: 'authors',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  })
  const author = authors.docs[0]
  if (!author) {
    if (slug !== 'zaviya-desk') return null
    if (!(await hasPublishedArticles())) {
      return {
        slug,
        name: locale === 'ur' ? 'زاویہ ڈیسک' : 'Zaviya Desk',
        role: locale === 'ur' ? 'نیوز روم' : 'Newsroom',
        bio:
          locale === 'ur'
            ? 'زاویہ کا نیوز روم۔'
            : 'The Zaviya newsroom. Stories are AI-assisted and reviewed by our editors.',
        articles: paginate(mockCards(locale), page),
      }
    }
    return null
  }
  const bio =
    typeof author.bio === 'string' ? author.bio : (author.bio as Record<string, string> | undefined)?.[locale]
  if (!(await hasPublishedArticles())) {
    return {
      slug: author.slug,
      name: author.name,
      role: author.role ?? undefined,
      bio,
      avatar: mapMedia(author.avatar as Media | number | null, locale),
      socials: author.socials?.map((s) => ({ platform: s.platform, url: s.url })),
      articles: paginate(mockCards(locale), page),
    }
  }
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: {
      ...publishedAnd({ author: { equals: author.id } }),
    },
    sort: '-publishedAt',
    page,
    limit: PAGE_SIZE,
    depth: 2,
    overrideAccess: true,
  })
  const docs = await Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
  return {
    slug: author.slug,
    name: author.name,
    role: author.role ?? undefined,
    bio,
    avatar: mapMedia(author.avatar as Media | number | null, locale),
    socials: author.socials?.map((s) => ({ platform: s.platform, url: s.url })),
    articles: {
      docs,
      page: result.page ?? page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    },
  }
})

export const getRelated = cache(async (locale: Locale, articleId: string, limit = 4): Promise<ArticleCard[]> => {
  if (!(await hasPublishedArticles())) {
    const all = mockCards(locale)
    const self = all.find((a) => a.id === articleId)
    return all
      .filter((a) => a.id !== articleId && (!self || a.category.slug === self.category.slug))
      .concat(all)
      .filter((a, i, arr) => a.id !== articleId && arr.findIndex((b) => b.id === a.id) === i)
      .slice(0, limit)
  }
  const payload = await getPayloadClient()
  let categoryId: string | number | undefined
  try {
    const current = await payload.findByID({
      collection: 'articles',
      id: articleId,
      depth: 0,
      overrideAccess: true,
    })
    categoryId =
      typeof current.category === 'object' && current.category ? current.category.id : current.category
  } catch {
    return []
  }
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: {
      ...publishedAnd(
        { id: { not_equals: articleId } },
        ...(categoryId ? [{ category: { equals: categoryId } }] : []),
      ),
    },
    sort: '-publishedAt',
    limit,
    depth: 2,
    overrideAccess: true,
  })
  return Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
})

export const getBreaking = cache(async (locale: Locale): Promise<ArticleCard[]> => {
  if (!(await hasPublishedArticles())) {
    return mockCards(locale).filter((a) => a.isBreaking || a.isLive)
  }
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: {
      ...publishedAnd({
        or: [{ isBreaking: { equals: true } }, { isLive: { equals: true } }],
      }),
    },
    sort: '-publishedAt',
    limit: 20,
    depth: 2,
    overrideAccess: true,
  })
  return Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
})

export const getLive = cache(async (locale: Locale): Promise<ArticleCard[]> => {
  if (!(await hasPublishedArticles())) {
    return mockCards(locale).filter((a) => a.isLive)
  }
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: {
      ...publishedAnd({ isLive: { equals: true } }),
    },
    sort: '-publishedAt',
    limit: 30,
    depth: 2,
    overrideAccess: true,
  })
  return Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
})

export const getMostRead = cache(async (locale: Locale, limit = 10): Promise<ArticleCard[]> => {
  if (!(await hasPublishedArticles())) {
    return mockCards(locale).slice(2, 2 + limit)
  }
  const cards = await loadPublishedCards(locale, limit + 5)
  return cards.slice(2, 2 + limit)
})

const TICKER_SERIES: RateSeries[] = ['gold_24k_tola', 'usd_interbank', 'usd_open_sell', 'petrol_super']

async function latestPoint(series: RateSeries): Promise<DataPoint | null> {
  const payload = await getPayloadClient()
  const r = await payload.find({
    collection: 'data-points',
    where: { series: { equals: series } },
    sort: '-observedAt',
    limit: 1,
    depth: 0,
  })
  return r.docs[0] ?? null
}

function rateLabel(series: RateSeries): string {
  const labels: Record<RateSeries, string> = {
    gold_24k_tola: 'Gold 24K / tola',
    gold_22k_tola: 'Gold 22K / tola',
    usd_interbank: 'USD interbank',
    usd_open_buy: 'USD open buy',
    usd_open_sell: 'USD open market',
    petrol_super: 'Petrol / litre',
    hsd: 'HSD / litre',
    kerosene: 'Kerosene / litre',
  }
  return labels[series]
}

function rateHref(series: RateSeries): string {
  if (series.startsWith('gold')) return '/gold-rate-today-pakistan'
  if (series.startsWith('usd')) return '/dollar-rate-today-pakistan'
  return '/petrol-price-today-pakistan'
}

export const getRatesTicker = cache(async (): Promise<RateTick[]> => {
  const payload = await getPayloadClient()
  const count = await payload.find({ collection: 'data-points', limit: 1, depth: 0 })
  if (count.totalDocs === 0) return mockRates()

  const ticks: RateTick[] = []
  for (const series of TICKER_SERIES) {
    const latest = await latestPoint(series)
    if (!latest) continue
    const prev = await payload.find({
      collection: 'data-points',
      where: { series: { equals: series } },
      sort: '-observedAt',
      limit: 2,
      depth: 0,
    })
    const previous = prev.docs[1]
    const value = latest.value
    const change = previous ? value - previous.value : 0
    const changePct = previous && previous.value ? (change / previous.value) * 100 : 0
    const history = await payload.find({
      collection: 'data-points',
      where: { series: { equals: series } },
      sort: '-observedAt',
      limit: 14,
      depth: 0,
    })
    ticks.push({
      series,
      label: rateLabel(series),
      value,
      unit: latest.unit,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      observedAt: latest.observedAt,
      href: rateHref(series),
      spark: history.docs.map((p) => p.value).reverse(),
    })
  }
  return ticks.length ? ticks : mockRates()
})

export const getDataPage = cache(async (locale: Locale, key: DataPageKey): Promise<DataPageFull> => {
  const payload = await getPayloadClient()
  const dp = await payload.find({
    collection: 'data-pages',
    where: { key: { equals: key } },
    limit: 1,
    locale,
    depth: 0,
  })
  const pointsCount = await payload.find({ collection: 'data-points', limit: 1 })
  if (pointsCount.totalDocs === 0 || !dp.docs[0]) return mockDataPage(locale, key)

  const page = dp.docs[0] as DataPage
  const headlineSeries =
    key === 'gold' ? 'gold_24k_tola' : key === 'usd-pkr' ? 'usd_interbank' : 'petrol_super'
  const ticker = await getRatesTicker()
  const headline = ticker.find((t) => t.series === headlineSeries) ?? ticker[0]
  const days = 30
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const historyPoints = await payload.find({
    collection: 'data-points',
    where: {
      and: [{ series: { equals: headlineSeries } }, { observedAt: { greater_than: since } }],
    },
    sort: 'observedAt',
    limit: 500,
  })
  return {
    key,
    slug: page.slug,
    title: page.title,
    intro: typeof page.intro === 'string' ? page.intro : undefined,
    faqs: (page.faqs ?? []).map((f) => ({ q: f.q, a: f.a })),
    updatedAt: page.updatedAt ?? headline.observedAt,
    source:
      key === 'gold'
        ? 'All Pakistan Sarafa Gems & Jewellers Association'
        : key === 'usd-pkr'
          ? 'State Bank of Pakistan / Forex Association of Pakistan'
          : 'OGRA / Finance Division',
    headline,
    table: Array.isArray(page.latestSnapshot)
      ? (page.latestSnapshot as DataPageFull['table'])
      : mockDataPage(locale, key).table,
    history: [
      {
        series: headlineSeries,
        points: historyPoints.docs.map((p) => ({ t: p.observedAt, v: p.value })),
      },
    ],
    cities: key === 'gold' ? mockDataPage(locale, key).cities : undefined,
    related: (await loadPublishedCards(locale, 8)).filter((a) => a.category.slug === 'business').slice(0, 4),
  }
})

export const search = cache(async (locale: Locale, q: string, page = 1): Promise<Paginated<ArticleCard>> => {
  const needle = q.trim().toLowerCase()
  if (!(await hasPublishedArticles())) {
    const hits = needle
      ? mockCards(locale).filter(
          (a) => a.title.toLowerCase().includes(needle) || a.dek?.toLowerCase().includes(needle),
        )
      : []
    return paginate(hits, page)
  }
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: {
      ...(needle
        ? publishedAnd({
            or: [{ title: { contains: needle } }, { dek: { contains: needle } }],
          })
        : publishedWhere),
    },
    sort: '-publishedAt',
    page,
    limit: PAGE_SIZE,
    depth: 2,
    overrideAccess: true,
  })
  const docs = await Promise.all(result.docs.map((d) => mapArticleCardAsync(d, locale)))
  return {
    docs,
    page: result.page ?? page,
    totalPages: result.totalPages,
    totalDocs: result.totalDocs,
  }
})

export const getStaticPage = cache(
  async (locale: Locale, slug: string): Promise<{ title: string; body: unknown } | null> => {
    const payload = await getPayloadClient()
    const pages = await payload.find({
      collection: 'pages',
      locale,
      where: { slug: { equals: slug } },
      limit: 1,
    })
    const page = pages.docs[0]
    if (page) {
      return {
        title: typeof page.title === 'string' ? page.title : String(page.title),
        body: page.body,
      }
    }
    const titles: Record<string, string> = {
      about: 'About Zaviya',
      'editorial-policy': 'Editorial Policy',
      'ai-policy': 'How We Use AI',
      corrections: 'Corrections Policy',
      privacy: 'Privacy Policy',
      terms: 'Terms of Use',
      contact: 'Contact Us',
      advertise: 'Advertise with Zaviya',
    }
    const title = titles[slug]
    if (!title) return null
    return { title, body: null }
  },
)
