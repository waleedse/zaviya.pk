import { notFound } from 'next/navigation'
import { PhonePageView, pairLabel } from '@/components/phones/PhoneViews'
import { getPhoneBySlug, getPhones } from '@/lib/phones/queries'
import { findPhone } from '@/lib/phones/pages'
import { fromPriceText, phoneSummary, popularPairs, relatedPhones } from '@/lib/phones/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Params) {
  const { locale: raw, slug } = await params
  const locale = parseLocale(raw)
  const phone = await getPhoneBySlug(slug)
  if (!phone) return { title: 'Not found', robots: { index: false } }
  const full = `${phone.brand.name} ${phone.name}`
  return buildPageMetadata({
    locale,
    title: `${full} Price in Pakistan & Specs`,
    description: `${full} price in Pakistan: ${phone.pricePkr ? fromPriceText(phone).replace('From ', 'starts at ') : 'price not announced yet'}. ${phoneSummary(phone)}`.slice(0, 300),
    enPath: `/mobile/${slug}`,
    ogImage: phone.imageUrl,
    absoluteTitle: false,
  })
}

export default async function MobilePage({ params }: Params) {
  const { locale: raw, slug } = await params
  const locale = parseLocale(raw)
  if (locale === 'ur') notFound()
  const phone = await getPhoneBySlug(slug)
  if (!phone) notFound()
  const all = await getPhones()
  const related = relatedPhones(phone, all, 6)
  const pairs = popularPairs(all, 60)
    .filter((p) => p.a === phone.slug || p.b === phone.slug)
    .slice(0, 6)
    .map((p) => {
      const a = findPhone(all, p.a)
      const b = findPhone(all, p.b)
      return a && b ? { key: p.key, label: pairLabel(a, b) } : null
    })
    .filter((p): p is { key: string; label: string } => p !== null)
  return <PhonePageView phone={phone} related={related} pairs={pairs} brandPhones={all.filter((p) => p.brand.slug === phone.brand.slug).length} />
}
