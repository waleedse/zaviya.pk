import { notFound } from 'next/navigation'
import type { Locale } from '@zaviya/shared'
import { parseLocale } from '@/lib/locale'
import { renderCategoryPage } from '../../category-view'

export const revalidate = 60

export async function generateStaticParams() {
  return []
}

/** Category page 2+ (reached through ?page=n, rewritten in proxy.ts), cached like page 1. */
export default async function CategoryPageN({ params }: { params: Promise<{ locale: string; category: string; n: string }> }) {
  const { locale: l, category, n } = await params
  const pageNum = parseInt(n, 10)
  if (!Number.isFinite(pageNum) || pageNum < 2) notFound()
  return renderCategoryPage(parseLocale(l) as Locale, category, pageNum)
}
