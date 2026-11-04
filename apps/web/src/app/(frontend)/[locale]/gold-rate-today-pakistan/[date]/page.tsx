import { renderRateDayPage, rateDayMetadata } from '@/lib/rate-day-route'

export const revalidate = 600

export async function generateStaticParams() {
  return []
}

const SLUG = 'gold-rate-today-pakistan'
type Props = { params: Promise<{ locale: string; date: string }> }

export async function generateMetadata({ params }: Props) {
  return rateDayMetadata(SLUG, await params)
}

export default async function Page({ params }: Props) {
  return renderRateDayPage(SLUG, await params)
}
