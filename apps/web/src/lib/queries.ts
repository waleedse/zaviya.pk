import 'server-only'
import {
  CATEGORIES,
  type ArticleCard,
  type ArticleFull,
  type AuthorFull,
  type CategoryRef,
  type CategorySlug,
  type DataPageFull,
  type DataPageKey,
  type HomeFeed,
  type Locale,
  type Paginated,
  type RateTick,
} from '@zaviya/shared'
import { categoryRef, mockArticle, mockCards, mockDataPage, mockRates } from './mock'

/**
 * Data access contract for the UI. Signatures are stable; implementations read from Payload
 * (Local API) and fall back to lib/mock.ts when the database has no published articles.
 */

const PAGE_SIZE = 12

function paginate<T>(items: T[], page: number, size = PAGE_SIZE): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const p = Math.min(Math.max(1, page), totalPages)
  return { docs: items.slice((p - 1) * size, p * size), page: p, totalPages, totalDocs: items.length }
}

export async function getCategories(locale: Locale): Promise<CategoryRef[]> {
  return CATEGORIES.map((c) => categoryRef(c.slug, locale))
}

export async function getHomeFeed(locale: Locale): Promise<HomeFeed> {
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

export async function getArticle(locale: Locale, category: string, slug: string): Promise<ArticleFull | null> {
  const card = mockCards(locale).find((a) => a.slug === slug && a.category.slug === category)
  return card ? mockArticle(card) : null
}

export async function getCategoryFeed(locale: Locale, slug: string, page = 1): Promise<Paginated<ArticleCard> | null> {
  if (!CATEGORIES.some((c) => c.slug === slug)) return null
  return paginate(mockCards(locale).filter((a) => a.category.slug === (slug as CategorySlug)), page)
}

export async function getTagFeed(locale: Locale, slug: string, page = 1): Promise<{ tag: { slug: string; name: string }; feed: Paginated<ArticleCard> } | null> {
  return { tag: { slug, name: slug }, feed: paginate(mockCards(locale), page) }
}

export async function getAuthor(locale: Locale, slug: string, page = 1): Promise<AuthorFull | null> {
  if (slug !== 'zaviya-desk') return null
  return {
    slug,
    name: locale === 'ur' ? 'زاویہ ڈیسک' : 'Zaviya Desk',
    role: locale === 'ur' ? 'نیوز روم' : 'Newsroom',
    bio: locale === 'ur' ? 'زاویہ کا نیوز روم۔' : 'The Zaviya newsroom. Stories are AI-assisted and reviewed by our editors.',
    articles: paginate(mockCards(locale), page),
  }
}

export async function getRelated(locale: Locale, articleId: string, limit = 4): Promise<ArticleCard[]> {
  const all = mockCards(locale)
  const self = all.find((a) => a.id === articleId)
  return all.filter((a) => a.id !== articleId && (!self || a.category.slug === self.category.slug)).concat(all).filter((a, i, arr) => a.id !== articleId && arr.findIndex((b) => b.id === a.id) === i).slice(0, limit)
}

export async function getBreaking(locale: Locale): Promise<ArticleCard[]> {
  return mockCards(locale).filter((a) => a.isBreaking || a.isLive)
}

export async function getLive(locale: Locale): Promise<ArticleCard[]> {
  return mockCards(locale).filter((a) => a.isLive)
}

export async function getMostRead(locale: Locale, limit = 10): Promise<ArticleCard[]> {
  return mockCards(locale).slice(2, 2 + limit)
}

export async function getRatesTicker(): Promise<RateTick[]> {
  return mockRates()
}

export async function getDataPage(locale: Locale, key: DataPageKey): Promise<DataPageFull> {
  return mockDataPage(locale, key)
}

export async function search(locale: Locale, q: string, page = 1): Promise<Paginated<ArticleCard>> {
  const needle = q.trim().toLowerCase()
  const hits = needle ? mockCards(locale).filter((a) => a.title.toLowerCase().includes(needle) || a.dek?.toLowerCase().includes(needle)) : []
  return paginate(hits, page)
}

export async function getStaticPage(locale: Locale, slug: string): Promise<{ title: string; body: unknown } | null> {
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
}
