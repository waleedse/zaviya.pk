import { LOCALES, type Locale } from '@zaviya/shared'
import { notFound } from 'next/navigation'

export function parseLocale(raw: string): Locale {
  if (!LOCALES.includes(raw as Locale)) notFound()
  return raw as Locale
}

export function publicPath(locale: Locale, segments: string[]): string {
  const path = segments.filter(Boolean).join('/')
  if (locale === 'ur') return path ? `/ur/${path}` : '/ur'
  return path ? `/${path}` : '/'
}
