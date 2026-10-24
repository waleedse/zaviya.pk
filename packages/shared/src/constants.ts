export const LOCALES = ['en', 'ur'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const RTL_LOCALES: readonly Locale[] = ['ur']

export const SITE = {
  name: 'Zaviya',
  /** The public brand in search results, og:site_name and schema.org names (ZAV-125); `name` stays the short wordmark */
  brandName: 'Zaviya News',
  brandAlternateNames: ['Zaviya', 'Zaviya.pk'],
  nameUr: 'زاویہ',
  tagline: 'Every story, the right angle',
  taglineUr: 'ہر خبر، صحیح زاویے سے',
  timezone: 'Asia/Karachi',
} as const

export const CATEGORIES = [
  { slug: 'pakistan', en: 'Pakistan', ur: 'پاکستان', color: '#0E7C5A' },
  { slug: 'world', en: 'World', ur: 'دنیا', color: '#2B59C3' },
  { slug: 'business', en: 'Business', ur: 'کاروبار', color: '#B8902B' },
  { slug: 'tech-telecom', en: 'Tech', ur: 'ٹیکنالوجی', color: '#7B4DFF' },
  { slug: 'ai', en: 'AI', ur: 'مصنوعی ذہانت', color: '#0891B2' },
  { slug: 'autos', en: 'Autos', ur: 'آٹوز', color: '#E4572E' },
  { slug: 'cricket', en: 'Cricket', ur: 'کرکٹ', color: '#1B998B' },
  { slug: 'sports', en: 'Sports', ur: 'کھیل', color: '#2E7D32' },
  { slug: 'education-jobs', en: 'Jobs', ur: 'تعلیم و نوکریاں', color: '#C2185B' },
  { slug: 'trending', en: 'Trending', ur: 'ٹرینڈنگ', color: '#FF7A00' },
] as const
export type CategorySlug = (typeof CATEGORIES)[number]['slug']
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]]

export const TRUST_TIERS = { OFFICIAL: 1, MAJOR: 2, OTHER: 3 } as const
export type TrustTier = 1 | 2 | 3

export const SENSITIVITY_FLAGS = [
  'military',
  'judiciary',
  'religion',
  'blasphemy',
  'violence',
  'death',
  'unverified',
  'minor',
  'election',
] as const
export type SensitivityFlag = (typeof SENSITIVITY_FLAGS)[number]

export const PRIORITIES = ['normal', 'high', 'breaking'] as const
export type Priority = (typeof PRIORITIES)[number]

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'x', 'whatsapp'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const DATA_PAGES = [
  { key: 'gold', slug: 'gold-rate-today-pakistan', en: 'Gold Rate Today in Pakistan', ur: 'آج پاکستان میں سونے کا ریٹ' },
  { key: 'usd-pkr', slug: 'dollar-rate-today-pakistan', en: 'Dollar Rate Today in Pakistan', ur: 'آج پاکستان میں ڈالر کا ریٹ' },
  { key: 'petrol', slug: 'petrol-price-today-pakistan', en: 'Petrol Price Today in Pakistan', ur: 'آج پاکستان میں پیٹرول کی قیمت' },
] as const
export type DataPageKey = (typeof DATA_PAGES)[number]['key']

export const RATE_SERIES = [
  'gold_24k_tola',
  'gold_22k_tola',
  'usd_interbank',
  'usd_open_buy',
  'usd_open_sell',
  'petrol_super',
  'hsd',
  'kerosene',
] as const
export type RateSeries = (typeof RATE_SERIES)[number]

export const CITIES = ['karachi', 'lahore', 'islamabad', 'peshawar', 'quetta', 'multan', 'faisalabad'] as const
export type City = (typeof CITIES)[number]
