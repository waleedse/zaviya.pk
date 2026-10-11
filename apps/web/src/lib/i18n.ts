import type { Locale } from '@zaviya/shared'

const en = {
  nav: {
    home: 'Home',
    live: 'Live',
    rates: 'Rates',
    search: 'Search',
    saved: 'Saved',
  },
  readInUrdu: 'Read in Urdu',
  readInEnglish: 'انگریزی میں پڑھیں',
  updated: 'Updated',
  published: 'Published',
  minRead: 'min read',
  advertisement: 'Advertisement',
  keyPoints: 'Key points',
  whatItMeans: 'What it means for you',
  sources: 'Sources',
  live: 'Live',
  breaking: 'Breaking',
  mostRead: 'Most read',
  latest: 'Latest',
  seeAll: 'See all',
  liveNow: 'Live now',
  explainers: 'What it means for you',
  webStories: 'Web stories',
  related: 'Related stories',
  moreFromCategory: 'More from',
  searchPlaceholder: 'Search news, rates, topics…',
  search: 'Search',
  recentSearches: 'Recent searches',
  noResults: 'No results found',
  tryDifferent: 'Try a different keyword or browse latest stories.',
  tabs: { all: 'All', news: 'News', rates: 'Rates' },
  share: { whatsapp: 'WhatsApp', facebook: 'Facebook', x: 'X', copy: 'Copy link', copied: 'Copied', save: 'Save' },
  follow: 'Follow',
  loadMore: 'Load more',
  page: 'Page',
  of: 'of',
  corrections: 'Corrections',
  tags: 'Tags',
  faq: 'FAQ',
  todaySummary: "Today's summary",
  lastUpdated: 'Last updated',
  source: 'Source',
  skipToContent: 'Skip to content',
  openMenu: 'Open menu',
  openSearch: 'Search',
  themeLight: 'Light mode',
  themeDark: 'Dark mode',
  newsletter: { title: 'Morning briefing', desc: 'Top Pakistan stories in your inbox.', cta: 'Subscribe' },
  whatsapp: { title: 'Join our WhatsApp channel', desc: 'Breaking news and daily rates.', cta: 'Join channel' },
  notFound: { title: 'Page not found', desc: 'The story or page you are looking for may have moved.' },
  gold: 'Gold',
  dollar: 'Dollar',
  petrol: 'Petrol',
  chart: { '7d': '7D', '30d': '30D', '1y': '1Y' },
  authorArticles: 'Articles by',
  editorial: 'Editorial',
} as const

const ur = {
  nav: { home: 'ہوم', live: 'لائیو', rates: 'ریٹ', search: 'تلاش', saved: 'محفوظ' },
  readInUrdu: 'اردو میں پڑھیں',
  readInEnglish: 'انگریزی میں پڑھیں',
  updated: 'اپ ڈیٹ',
  published: 'شائع',
  minRead: 'منٹ پڑھیں',
  advertisement: 'اشتہار',
  keyPoints: 'اہم نکات',
  whatItMeans: 'آپ کے لیے کیا معنی رکھتا ہے',
  sources: 'ذرائع',
  live: 'لائیو',
  breaking: 'بریکنگ',
  mostRead: 'سب سے زیادہ پڑھی گئی',
  latest: 'تازہ ترین',
  seeAll: 'مزید دیکھیں',
  liveNow: 'اب لائیو',
  explainers: 'آپ کے لیے کیا معنی رکھتا ہے',
  webStories: 'ویب کہانیاں',
  related: 'متعلقہ خبریں',
  moreFromCategory: 'مزید از',
  searchPlaceholder: 'خبریں، ریٹ، موضوعات تلاش کریں…',
  search: 'تلاش',
  recentSearches: 'حالیہ تلاش',
  noResults: 'کوئی نتیجہ نہیں ملا',
  tryDifferent: 'دوسرا لفظ آزمائیں یا تازہ خبریں دیکھیں۔',
  tabs: { all: 'سب', news: 'خبریں', rates: 'ریٹ' },
  share: { whatsapp: 'واٹس ایپ', facebook: 'فیس بک', x: 'ایکس', copy: 'لنک کاپی', copied: 'کاپی ہو گیا', save: 'محفوظ' },
  follow: 'فالو',
  loadMore: 'مزید لوڈ کریں',
  page: 'صفحہ',
  of: 'از',
  corrections: 'تصحیحات',
  tags: 'ٹیگز',
  faq: 'سوالات',
  todaySummary: 'آج کا خلاصہ',
  lastUpdated: 'آخری اپ ڈیٹ',
  source: 'ماخذ',
  skipToContent: 'مواد پر جائیں',
  openMenu: 'مینو کھولیں',
  openSearch: 'تلاش',
  themeLight: 'لائٹ موڈ',
  themeDark: 'ڈارک موڈ',
  newsletter: { title: 'صبح کا بریفنگ', desc: 'اہم پاکستان خبریں آپ کے ان باکس میں۔', cta: 'سبسکرائب' },
  whatsapp: { title: 'ہمارا واٹس ایپ چینل', desc: 'بریکنگ نیوز اور روزانہ ریٹ۔', cta: 'چینل جوائن کریں' },
  notFound: { title: 'صفحہ نہیں ملا', desc: 'جو صفحہ یا خبر آپ ڈھونڈ رہے ہیں شاید منتقل ہو گئی ہو۔' },
  gold: 'سونا',
  dollar: 'ڈالر',
  petrol: 'پیٹرول',
  chart: { '7d': '7 دن', '30d': '30 دن', '1y': '1 سال' },
  authorArticles: 'مصنف کی تحریریں',
  editorial: 'اداریہ',
}

export const dict = { en, ur } as const

export type Dictionary = typeof en

export function t(locale: Locale): Dictionary {
  return dict[locale] as Dictionary
}

export function localePath(locale: Locale, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (locale === 'ur') return p.startsWith('/ur') ? p : `/ur${p === '/' ? '' : p}`
  return p.replace(/^\/ur/, '') || '/'
}

export function switchLocaleHref(currentLocale: Locale, alternateHref?: string, pathname?: string): string | null {
  if (alternateHref) return alternateHref
  if (!pathname) return currentLocale === 'en' ? '/ur' : '/'
  if (currentLocale === 'en') return `/ur${pathname === '/' ? '' : pathname}`
  return pathname.replace(/^\/ur/, '') || '/'
}

/** Urdu edition switch: off while the site runs English-only. Set NEXT_PUBLIC_URDU_ENABLED=true to bring it back. */
export function urduEnabled(): boolean {
  return process.env.NEXT_PUBLIC_URDU_ENABLED === 'true'
}
