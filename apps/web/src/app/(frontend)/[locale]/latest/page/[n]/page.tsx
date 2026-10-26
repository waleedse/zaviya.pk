import { notFound } from 'next/navigation'
import { parseLocale } from '@/lib/locale'
import { renderLatestPage } from '../../latest-view'

export const revalidate = 60

export async function generateStaticParams() {
  return []
}

/** /latest page 2+ (reached through ?page=n, rewritten in proxy.ts), cached like page 1. */
export default async function LatestPageN({ params }: { params: Promise<{ locale: string; n: string }> }) {
  const { locale: l, n } = await params
  const pageNum = parseInt(n, 10)
  if (!Number.isFinite(pageNum) || pageNum < 2) notFound()
  return renderLatestPage(parseLocale(l), pageNum)
}
