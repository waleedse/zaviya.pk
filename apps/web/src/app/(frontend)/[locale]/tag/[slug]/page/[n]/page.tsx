import { notFound } from 'next/navigation'
import type { Locale } from '@zaviya/shared'
import { parseLocale } from '@/lib/locale'
import { renderTagPage } from '../../tag-view'

export const revalidate = 60

export async function generateStaticParams() {
  return []
}

/** Tag page 2+ (reached through ?page=n, rewritten in proxy.ts), cached like page 1. */
export default async function TagPageN({ params }: { params: Promise<{ locale: string; slug: string; n: string }> }) {
  const { locale: l, slug, n } = await params
  const pageNum = parseInt(n, 10)
  if (!Number.isFinite(pageNum) || pageNum < 2) notFound()
  return renderTagPage(parseLocale(l) as Locale, slug, pageNum)
}
