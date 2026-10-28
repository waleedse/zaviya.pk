import 'server-only'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
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
import { categoryRef, mockArticle, mockCards, mockRates, articleHref } from './mock'
import { getPayloadClient } from './payload'
import { findReplacementHref, type FindApi } from './duplicate-redirect'
import { getLearning } from './learning'
import { LATEST_PAGE_SIZE } from './tag-rules'
import { groupStoryDigests, type StoryDigest } from './web-stories'
import { isActive, parsePlan, PIN_SECTIONS, sectionOrder, type FrontPagePlan, type FrontSection, type PinSection, type PlanSlot } from './front-page'
import type { Where } from 'payload'
import type { Media, Article, Category, Author, Tag, DataPage, DataPoint } from '../payload-types'

const PAGE_SIZE = 12

/**
 * Fields a card needs. Listing queries select only these: without it Payload also loads and joins the body,
 * FAQs, sources and key points of every article, which made each page regeneration cost ~300 heavy queries (ZAV-187).
 */
const CARD_SELECT = {
  slug: true,
  title: true,
  dek: true,
  createdAt: true,
  updatedAt: true,
  category: true,
  heroImage: true,
  author: true,
  publishedAt: true,
  readingTime: true,
  isLive: true,
  isBreaking: true,
  priority: true,
} as const

/**
 * React cache() only dedupes inside one request, so every ISR regeneration of every page (hundreds of tag, category and
 * article pages) repeated the layout queries. This keeps one copy per `revalidate` seconds across requests too (ZAV-187).
 */
function sharedCache<A extends unknown[], R>(name: string, revalidate: number, fn: (...args: A) => Promise<R>) {
  return cache(unstable_cache(fn, ['zaviya-shared', name], { revalidate, tags: ['shared-data'] }))
}

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

/** Files served by this app are referenced by path, so next/image and any domain work the same. */
function localMediaPath(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const m = /^https?:\/\/[^/]+(\/api\/media\/.*)$/.exec(url)
  return m ? m[1] : url
}

function mapMedia(m: Media | number | null | undefined, locale: Locale): ImageRef | undefined {
  if (!m || typeof m === 'number') return undefined
  const alt = typeof m.alt === 'string' ? m.alt : (m.alt as Record<string, string> | undefined)?.[locale] ?? ''
  const url = localMediaPath(m.url) ?? ''
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
          thumb: localMediaPath(sizes.thumb?.url),
          card: localMediaPath(sizes.card?.url),
          hero: localMediaPath(sizes.hero?.url),
          square: localMediaPath(sizes.square?.url),
          portrait: localMediaPath(sizes.portrait?.url),
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

/** Mock stories/rates are for local demos only; never show invented news on a real site. */
function demoData(): boolean {
  return process.env.ZAVIYA_DEMO_DATA === '1'
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

/** Cards for a list of articles; the other-language links come from ONE query instead of one findByID per card. */
async function mapArticleCards(docs: Article[], locale: Locale): Promise<ArticleCard[]> {
  const cards = docs.map((d) => mapArticleCard(d, locale, mapCategory(d.category as Category, locale)))
  if (!docs.length) return cards
  const other: Locale = locale === 'en' ? 'ur' : 'en'
  try {
    const payload = await getPayloadClient()
    const res = await payload.find({
      collection: 'articles',
      locale: other,
      where: { id: { in: docs.map((d) => d.id) } },
      select: { slug: true },
      depth: 0,
      limit: docs.length,
      pagination: false,
      overrideAccess: true,
    })
    const slugs = new Map(res.docs.map((d) => [String(d.id), d.slug ? String(d.slug) : '']))
    for (const c of cards) {
      const slug = slugs.get(c.id)
      if (slug) c.alternateHref = articleHref(other, c.category.slug, slug)
    }
  } catch {
    // no language link on these cards; the page still renders
  }
  return cards
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
    select: CARD_SELECT,
    overrideAccess: true,
  })
  return mapArticleCards(result.docs as unknown as Article[], locale)
}

export const getCategories = sharedCache('getCategories', 300, async (locale: Locale): Promise<CategoryRef[]> => {
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

/** The front page holds a lot of stories: lead, 4 seconds, a 30-story latest river and 6-story section rails. */
function homeFeedFrom(all: ArticleCard[], locale: Locale): HomeFeed {
  const rails = CATEGORIES.map((c) => ({
    category: categoryRef(c.slug, locale),
    articles: all.filter((a) => a.category.slug === c.slug).slice(0, 6),
  })).filter((r) => r.articles.length > 0)
  return {
    hero: all[0] ?? null,
    secondary: all.slice(1, 5),
    live: all.filter((a) => a.isLive),
    latest: all.slice(0, 40),
    explainers: all.filter((a) => a.category.slug === 'trending' || a.category.slug === 'business').slice(0, 3),
    mostRead: all.slice(3, 13),
    rails,
  }
}

export const getHomeFeed = sharedCache('getHomeFeed', 60, async (locale: Locale): Promise<HomeFeed> => {
  if (demoData() && !(await hasPublishedArticles())) {
    return homeFeedFrom(mockCards(locale), locale)
  }
  return homeFeedFrom(await loadPublishedCards(locale, 120), locale)
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
      ? localMediaPath((seoGroup.ogImage as Media).url)
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
    if (demoData() && !(await hasPublishedArticles())) {
      const card = mockCards(locale).find((a) => a.slug === slug && a.category.slug === category)
      return card ? mockArticle(card) : null
    }
    // categories.slug is a Postgres enum: an unknown slug (e.g. legacy /news/<slug>) would throw, not miss
    if (!CATEGORIES.some((c) => c.slug === category)) return null
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
  if (demoData() && !(await hasPublishedArticles())) {
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
    if (demoData() && !(await hasPublishedArticles())) {
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
      select: CARD_SELECT,
      overrideAccess: true,
    })
    const docs = await mapArticleCards(result.docs as unknown as Article[], locale)
    return {
      docs,
      page: result.page ?? page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    }
  },
)

export const getTagFeed = sharedCache(
  'getTagFeed',
  300,
  async (
    locale: Locale,
    slug: string,
    page: number = 1,
  ): Promise<{ tag: { slug: string; name: string }; feed: Paginated<ArticleCard> } | null> => {
    const payload = await getPayloadClient()
    const tagRes = await payload.find({
      collection: 'tags',
      locale,
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
    })
    const tagDoc = tagRes.docs[0]
    const tagName = tagDoc
      ? typeof tagDoc.name === 'string'
        ? tagDoc.name
        : slug
      : slug
    if (demoData() && !(await hasPublishedArticles())) {
      return { tag: { slug, name: tagName }, feed: paginate(mockCards(locale), page) }
    }
    if (!tagDoc) return null
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
      select: CARD_SELECT,
      overrideAccess: true,
    })
    const docs = await mapArticleCards(result.docs as unknown as Article[], locale)
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

/** Published stories carrying a tag: tag chips on articles link only when a tag page has enough of them (ZAV-221). */
export const getTagStoryCount = sharedCache('getTagStoryCount', 1800, async (locale: Locale, slug: string): Promise<number> => {
  const payload = await getPayloadClient()
  const tag = await payload.find({ collection: 'tags', locale, where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  const id = tag.docs[0]?.id
  if (id === undefined) return 0
  const res = await payload.count({ collection: 'articles', locale, where: publishedAnd({ tags: { contains: id } }), overrideAccess: true })
  return res.totalDocs
})

export interface LatestLink {
  id: string
  href: string
  title: string
  category: string
  publishedAt: string
}

/**
 * Plain list of the newest stories (title + link only), 50 per page, so every new article is linked from a cheap page
 * Google crawls first. `category` limits it to one section (ZAV-221).
 */
export const getLatestLinks = sharedCache(
  'getLatestLinks',
  60,
  async (locale: Locale, categorySlug: string | null, page: number = 1, limit: number = LATEST_PAGE_SIZE): Promise<Paginated<LatestLink>> => {
    const empty: Paginated<LatestLink> = { docs: [], page: 1, totalPages: 1, totalDocs: 0 }
    if (demoData() && !(await hasPublishedArticles())) {
      const cards = mockCards(locale).filter((a) => !categorySlug || a.category.slug === categorySlug)
      const p = paginate(cards, page, limit)
      return { ...p, docs: p.docs.map((a) => ({ id: a.id, href: a.href, title: a.title, category: a.category.name, publishedAt: a.publishedAt })) }
    }
    const payload = await getPayloadClient()
    let where = publishedWhere
    if (categorySlug) {
      const cat = await payload.find({ collection: 'categories', where: { slug: { equals: categorySlug } }, limit: 1, depth: 0 })
      if (!cat.docs[0]) return empty
      where = publishedAnd({ category: { equals: cat.docs[0].id } })
    }
    const result = await payload.find({
      collection: 'articles',
      locale,
      where,
      sort: '-publishedAt',
      page,
      limit,
      depth: 1,
      select: { slug: true, title: true, category: true, publishedAt: true, createdAt: true },
      overrideAccess: true,
    })
    return {
      docs: result.docs.map((d) => {
        const cat = mapCategory((d as unknown as Article).category as Category, locale)
        return {
          id: String(d.id),
          href: articleHref(locale, cat.slug, String(d.slug ?? '')),
          title: String(d.title ?? ''),
          category: cat.name,
          publishedAt: (d.publishedAt ?? d.createdAt) as string,
        }
      }),
      page: result.page ?? page,
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
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
    if (demoData() && !(await hasPublishedArticles())) {
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
  if (demoData() && !(await hasPublishedArticles())) {
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
    select: CARD_SELECT,
    overrideAccess: true,
  })
  const docs = await mapArticleCards(result.docs as unknown as Article[], locale)
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
  if (demoData() && !(await hasPublishedArticles())) {
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
    select: CARD_SELECT,
    overrideAccess: true,
  })
  return mapArticleCards(result.docs as unknown as Article[], locale)
})

export const getBreaking = sharedCache('getBreaking', 60, async (locale: Locale): Promise<ArticleCard[]> => {
  if (demoData() && !(await hasPublishedArticles())) {
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
    select: CARD_SELECT,
    overrideAccess: true,
  })
  return mapArticleCards(result.docs as unknown as Article[], locale)
})

export interface UpcomingEvent {
  title: string
  date: string
  kind: string
  href?: string
}

/** Next petrol/diesel price notification: the government revises prices on the 15th and the last day of each month. */
function nextFuelReview(now = new Date()): UpcomingEvent {
  const pk = new Date(now.getTime() + 5 * 3_600_000)
  const y = pk.getUTCFullYear()
  const m = pk.getUTCMonth()
  const d = pk.getUTCDate()
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const date = d < 15 ? new Date(Date.UTC(y, m, 15)) : d < last ? new Date(Date.UTC(y, m, last)) : new Date(Date.UTC(y, m + 1, 15))
  return { title: 'Next petrol price announcement', date: date.toISOString().slice(0, 10), kind: 'prices', href: '/petrol-price-today-pakistan' }
}

/** Upcoming dates for the homepage: the research agent's list plus the fortnightly fuel review, soonest first. */
export const getUpcoming = cache(async (limit = 5): Promise<UpcomingEvent[]> => {
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
  let list: UpcomingEvent[] = []
  try {
    const payload = await getPayloadClient()
    list = (await getLearning<UpcomingEvent[]>(payload, 'upcoming_events')) ?? []
  } catch {
    list = []
  }
  const fuel = nextFuelReview()
  const all = list.some((e) => e.kind === 'prices' && e.date === fuel.date) ? list : [...list, fuel]
  // ZAV-206: SBP policy / MPC rows link to the policy rate page unless the list already carries a link
  const linked = all.map((e) =>
    e.href
      ? e
      : /\b(sbp|mpc|policy rate)\b/i.test(e.title)
        ? { ...e, href: '/sbp-policy-rate' }
        : /\b(fbr|tax return|income tax return)\b/i.test(e.title) && /\b(deadline|return|last date)\b/i.test(e.title)
          ? { ...e, href: '/income-tax-return-deadline-pakistan' }
          : e,
  )
  return linked.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit)
})

const PRIORITY_RANK: Record<string, number> = { breaking: 3, high: 2, normal: 1 }

/**
 * Top stories of the last `hours`: the editor marks the day's 5-8 most important stories as
 * priority high (breaking stays breaking), then newest first.
 */
export const getTopStories = sharedCache('getTopStories', 60, async (locale: Locale, hours: number, limit: number = 8): Promise<ArticleCard[]> => {
  if (demoData() && !(await hasPublishedArticles())) return mockCards(locale).slice(0, limit)
  const payload = await getPayloadClient()
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: { ...publishedAnd({ publishedAt: { greater_than: since } }) },
    sort: '-publishedAt',
    limit: 150,
    depth: 2,
    select: CARD_SELECT,
    overrideAccess: true,
  })
  const ranked = [...result.docs].sort(
    (a, b) =>
      (PRIORITY_RANK[String(b.priority ?? 'normal')] ?? 1) - (PRIORITY_RANK[String(a.priority ?? 'normal')] ?? 1) ||
      Number(Boolean(b.heroImage)) - Number(Boolean(a.heroImage)) ||
      String(b.publishedAt).localeCompare(String(a.publishedAt)),
  )
  return mapArticleCards(ranked.slice(0, limit) as unknown as Article[], locale)
})

/**
 * Web Stories (ZAV-242): published articles of the last `days` days, grouped by Pakistan calendar day. Each day carries its top
 * stories (priority, then a hero image, then newest) and up to 3 breaking ones. One cached read feeds the story page, the index and the sitemap.
 */
export const getStoryDigests = sharedCache('getStoryDigests', 300, async (days: number): Promise<StoryDigest[]> => {
  const payload = await getPayloadClient()
  const since = new Date(Date.now() - days * 24 * 3_600_000).toISOString()
  const result = await payload.find({
    collection: 'articles',
    locale: 'en',
    where: { ...publishedAnd({ publishedAt: { greater_than: since } }) },
    sort: '-publishedAt',
    limit: 400,
    depth: 2,
    select: CARD_SELECT,
    overrideAccess: true,
  })
  const cards = await mapArticleCards(result.docs as unknown as Article[], 'en')
  return groupStoryDigests(cards)
})

export const getLive = sharedCache('getLive', 60, async (locale: Locale): Promise<ArticleCard[]> => {
  if (demoData() && !(await hasPublishedArticles())) {
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
    select: CARD_SELECT,
    overrideAccess: true,
  })
  return mapArticleCards(result.docs as unknown as Article[], locale)
})

/** Tags used most across the latest stories: the site's own "trending now" list. */
export const getTrendingTags = sharedCache('getTrendingTags', 300, async (locale: Locale, limit: number = 10): Promise<{ slug: string; name: string; count: number }[]> => {
  if (demoData() && !(await hasPublishedArticles())) return []
  const payload = await getPayloadClient()
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const result = await payload.find({
    collection: 'articles',
    locale,
    where: publishedAnd({ publishedAt: { greater_than: since } }),
    sort: '-publishedAt',
    limit: 120,
    depth: 1,
    overrideAccess: true,
    select: { tags: true },
  })
  const counts = new Map<string, { slug: string; name: string; count: number }>()
  for (const doc of result.docs) {
    for (const tag of Array.isArray(doc.tags) ? doc.tags : []) {
      if (typeof tag !== 'object' || !tag?.slug) continue
      const name = typeof tag.name === 'string' ? tag.name : String(tag.name ?? tag.slug)
      const cur = counts.get(tag.slug) ?? { slug: tag.slug, name, count: 0 }
      cur.count += 1
      counts.set(tag.slug, cur)
    }
  }
  return [...counts.values()].filter((t) => t.count > 1).sort((a, b) => b.count - a.count).slice(0, limit)
})

export const getMostRead = sharedCache('getMostRead', 60, async (locale: Locale, limit: number = 10): Promise<ArticleCard[]> => {
  if (demoData() && !(await hasPublishedArticles())) {
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

function rateLabel(series: RateSeries, locale: Locale = 'en'): string {
  const labels: Record<RateSeries, [string, string]> = {
    gold_24k_tola: ['Gold 24K / tola', 'سونا 24 قیراط / تولہ'],
    gold_22k_tola: ['Gold 22K / tola', 'سونا 22 قیراط / تولہ'],
    usd_interbank: ['Dollar (market)', 'ڈالر (مارکیٹ)'],
    usd_open_buy: ['Dollar open buy', 'ڈالر اوپن خرید'],
    usd_open_sell: ['Dollar open market', 'ڈالر اوپن مارکیٹ'],
    petrol_super: ['Petrol / litre', 'پیٹرول / لیٹر'],
    hsd: ['Diesel / litre', 'ڈیزل / لیٹر'],
    kerosene: ['Kerosene / litre', 'مٹی کا تیل / لیٹر'],
  }
  return labels[series][locale === 'ur' ? 1 : 0]
}

function rateHref(series: RateSeries): string {
  if (series.startsWith('gold')) return '/gold-rate-today-pakistan'
  if (series.startsWith('usd')) return '/dollar-rate-today-pakistan'
  return '/petrol-price-today-pakistan'
}

export const getRatesTicker = sharedCache('getRatesTicker', 300, async (locale: Locale = 'en'): Promise<RateTick[]> => {
  const payload = await getPayloadClient()
  const count = await payload.find({ collection: 'data-points', limit: 1, depth: 0 })
  if (count.totalDocs === 0) return demoData() ? mockRates() : []

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
      label: rateLabel(series, locale),
      value,
      unit: latest.unit,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      observedAt: latest.observedAt,
      href: rateHref(series),
      spark: history.docs.map((p) => p.value).reverse(),
    })
  }
  return ticks.length || !demoData() ? ticks : mockRates()
})

const DATA_SOURCES: Record<DataPageKey, { en: string; ur: string }> = {
  gold: {
    en: 'International spot gold price (gold-api.com) converted to PKR at the market exchange rate. Local Sarafa rates can differ by a premium.',
    ur: 'بین الاقوامی سونے کی قیمت (gold-api.com) کو مارکیٹ ریٹ پر روپے میں تبدیل کیا گیا۔ مقامی صرافہ ریٹ میں فرق ہو سکتا ہے۔',
  },
  'usd-pkr': {
    en: 'Market mid-rate: exchangerate-api.com · Open market buy/sell: forex.pk',
    ur: 'مارکیٹ ریٹ: exchangerate-api.com · اوپن مارکیٹ خرید و فروخت: forex.pk',
  },
  petrol: {
    en: 'Government-notified prices as reported by at least two Pakistani news outlets.',
    ur: 'حکومت کی جانب سے اعلان کردہ قیمتیں، کم از کم دو پاکستانی خبر رساں اداروں کی رپورٹ کے مطابق۔',
  },
}

export const getDataPage = cache(async (locale: Locale, key: DataPageKey): Promise<DataPageFull> => {
  const payload = await getPayloadClient()
  const def = DATA_PAGES.find((d) => d.key === key)!
  const dp = await payload.find({
    collection: 'data-pages',
    where: { key: { equals: key } },
    limit: 1,
    locale,
    depth: 0,
  })
  const page = dp.docs[0] as DataPage | undefined
  const headlineSeries: RateSeries = key === 'gold' ? 'gold_24k_tola' : key === 'usd-pkr' ? 'usd_open_sell' : 'petrol_super'
  const ticker = await getRatesTicker(locale)
  const headline = ticker.find((t) => t.series === headlineSeries) ?? (key === 'usd-pkr' ? ticker.find((t) => t.series === 'usd_interbank') : undefined) ?? null
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const historyPoints = headline
    ? await payload.find({
        collection: 'data-points',
        where: { and: [{ series: { equals: headline.series } }, { observedAt: { greater_than: since } }] },
        sort: 'observedAt',
        limit: 500,
      })
    : { docs: [] as DataPoint[] }
  return {
    key,
    slug: page?.slug ?? def.slug,
    title: (typeof page?.title === 'string' && page.title) || (locale === 'ur' ? def.ur : def.en),
    intro: typeof page?.intro === 'string' ? page.intro : undefined,
    faqs: (page?.faqs ?? []).map((f) => ({ q: f.q, a: f.a })),
    updatedAt: headline?.observedAt ?? page?.updatedAt ?? new Date().toISOString(),
    source: DATA_SOURCES[key][locale],
    headline,
    table: Array.isArray(page?.latestSnapshot) ? (page!.latestSnapshot as DataPageFull['table']) : [],
    history: headline ? [{ series: headline.series, points: historyPoints.docs.map((p) => ({ t: p.observedAt, v: p.value })) }] : [],
    cities: undefined,
    related: (await loadPublishedCards(locale, 12)).filter((a) => a.category.slug === 'business').slice(0, 4),
  }
})

export const search = cache(async (locale: Locale, q: string, page = 1): Promise<Paginated<ArticleCard>> => {
  const needle = q.trim().toLowerCase()
  if (demoData() && !(await hasPublishedArticles())) {
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
    select: CARD_SELECT,
    overrideAccess: true,
  })
  const docs = await mapArticleCards(result.docs as unknown as Article[], locale)
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

export interface ResolvedFrontPage {
  lead?: ArticleCard
  seconds: ArticleCard[]
  pins: Partial<Record<PinSection, ArticleCard[]>>
  hidden: Set<string>
  order: FrontSection[]
  note?: string
}

/**
 * The editor's homepage plan with each article id turned into a card. Expired slots, unpublished
 * stories and a missing plan all fall back to the automatic page.
 */
export const getFrontPagePlan = cache(async (locale: Locale): Promise<ResolvedFrontPage> => {
  const empty: ResolvedFrontPage = { seconds: [], pins: {}, hidden: new Set(), order: sectionOrder({}) }
  let plan: FrontPagePlan
  let note: string | undefined
  try {
    const payload = await getPayloadClient()
    const doc = (await payload.findGlobal({ slug: 'front-page', overrideAccess: true, depth: 0 })) as { plan?: unknown; note?: string | null }
    plan = parsePlan(doc.plan)
    note = doc.note ?? undefined
  } catch {
    return empty
  }
  const now = Date.now()
  const live = (list?: PlanSlot[]) => (list ?? []).filter((s) => isActive(s, now)).map((s) => s.id)
  const leadId = isActive(plan.lead, now) ? plan.lead.id : undefined
  const pinIds = Object.fromEntries(PIN_SECTIONS.map((k) => [k, live(plan.pins?.[k])])) as Record<PinSection, number[]>
  const ids = [...new Set([leadId, ...live(plan.seconds), ...Object.values(pinIds).flat()].filter((x): x is number => x != null))]
  const cards = new Map<number, ArticleCard>()
  if (ids.length) {
    const payload = await getPayloadClient()
    const result = await payload.find({
      collection: 'articles',
      locale,
      where: publishedAnd({ id: { in: ids } }),
      limit: ids.length,
      depth: 2,
      select: CARD_SELECT,
      overrideAccess: true,
    })
    for (const c of await mapArticleCards(result.docs as unknown as Article[], locale)) cards.set(Number(c.id), c)
  }
  const pick = (list: number[]) => list.map((id) => cards.get(id)).filter((c): c is ArticleCard => Boolean(c))
  return {
    lead: leadId != null ? cards.get(leadId) : undefined,
    seconds: pick(live(plan.seconds)),
    pins: Object.fromEntries(PIN_SECTIONS.map((k) => [k, pick(pinIds[k])])),
    hidden: new Set((plan.hidden ?? []).map(String)),
    order: sectionOrder(plan),
    note,
  }
})

/** Live article of the same story for a removed duplicate's URL (ZAV-92), or null. */
export const getDuplicateReplacementHref = cache(async (locale: Locale, slug: string): Promise<string | null> => {
  if (demoData()) return null
  const payload = await getPayloadClient()
  return findReplacementHref(payload as unknown as FindApi, locale, slug)
})
