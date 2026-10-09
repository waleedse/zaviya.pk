import type { CategorySlug, DataPageKey, Locale, Priority, RateSeries, TrustTier } from './constants'

/** View models consumed by the UI. Produced by apps/web/src/lib/queries.ts. */

export interface ImageRef {
  url: string
  alt: string
  width: number
  height: number
  credit?: string
  isAiGenerated?: boolean
  /** Payload image size URLs, when available */
  sizes?: Partial<Record<'thumb' | 'card' | 'hero' | 'square' | 'portrait', string>>
}

export interface CategoryRef {
  slug: CategorySlug
  name: string
  color: string
}

export interface AuthorRef {
  slug: string
  name: string
  role?: string
  avatar?: ImageRef
}

export interface ArticleCard {
  id: string
  slug: string
  locale: Locale
  href: string
  title: string
  dek?: string
  category: CategoryRef
  image?: ImageRef
  author?: AuthorRef
  publishedAt: string
  updatedAt?: string
  readingTime?: number
  isLive?: boolean
  isBreaking?: boolean
  priority?: Priority
  /** href of the same article in the other locale, if it exists */
  alternateHref?: string
}

export interface SourceRef {
  name: string
  url: string
  tier: TrustTier
  publishedAt?: string
}

export interface LiveUpdate {
  at: string
  text: string
}

export interface FAQ {
  q: string
  a: string
}

export interface Correction {
  at: string
  note: string
}

export interface ArticleFull extends ArticleCard {
  /** Lexical rich text JSON (render with @payloadcms/richtext-lexical/react) */
  body: unknown
  whatItMeans?: unknown
  keyPoints: string[]
  faqs: FAQ[]
  sources: SourceRef[]
  embeds: { type: 'x' | 'instagram' | 'youtube'; url: string }[]
  tags: { slug: string; name: string }[]
  updates: LiveUpdate[]
  corrections: Correction[]
  author: AuthorRef & { bio?: string }
  seo: {
    metaTitle?: string
    metaDescription?: string
    ogImage?: string
    canonical?: string
    noindex?: boolean
  }
}

export interface Paginated<T> {
  docs: T[]
  page: number
  totalPages: number
  totalDocs: number
}

export interface HomeFeed {
  hero: ArticleCard | null
  secondary: ArticleCard[]
  live: ArticleCard[]
  latest: ArticleCard[]
  explainers: ArticleCard[]
  mostRead: ArticleCard[]
  rails: { category: CategoryRef; articles: ArticleCard[] }[]
}

export interface RateTick {
  series: RateSeries
  label: string
  value: number
  unit: string
  change: number
  changePct: number
  observedAt: string
  href: string
  spark: number[]
}

export interface DataPageFull {
  key: DataPageKey
  slug: string
  title: string
  intro?: string
  faqs: FAQ[]
  updatedAt: string
  source: string
  headline: RateTick
  table: { label: string; values: Record<string, number | string> }[]
  history: { series: RateSeries; points: { t: string; v: number }[] }[]
  cities?: { city: string; values: Record<string, number> }[]
  related: ArticleCard[]
}

export interface AuthorFull extends AuthorRef {
  bio?: string
  socials?: { platform: string; url: string }[]
  articles: Paginated<ArticleCard>
}
