import { notFound } from 'next/navigation'
import { formatPkr } from '@zaviya/shared'
import { OfferPageView } from '@/components/offers/OfferViews'
import { getOffer, sameProductOffers, similarOffers } from '@/lib/offers/queries'
import { monthYear, offerFaqs, shortTitle } from '@/lib/offers/copy'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

/** /prices/item/<slug>: one product from a Pakistani store website, with every store that lists it */
export const revalidate = 3600

type Props = { params: Promise<{ locale: string; slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params
  const o = await getOffer(slug)
  if (!o) return { title: 'Not found', robots: { index: false } }
  const stale = !o.seenAt || Date.now() - new Date(o.seenAt).getTime() > 3 * 86_400_000
  return buildPageMetadata({
    locale: parseLocale(locale),
    title: `${shortTitle(o.title, 60)} Price in Pakistan (${monthYear()})${o.pricePkr ? `: ${formatPkr(o.pricePkr)}` : ''}`,
    description: `${shortTitle(o.title)}${o.pricePkr ? ` is ${formatPkr(o.pricePkr)}` : ''} at ${o.storeName}${o.inStock === false ? ' (out of stock)' : ''}. Compare store prices, see price changes and buy from the store directly.`,
    enPath: `/prices/item/${slug}`,
    ogImage: o.imageUrl ?? undefined,
    absoluteTitle: true,
    noindex: stale || !o.pricePkr || !o.imageUrl || o.group === 'other',
  })
}

export default async function OfferPage({ params }: Props) {
  const { locale, slug } = await params
  if (parseLocale(locale) === 'ur') notFound()
  const o = await getOffer(slug)
  if (!o) notFound()
  const [stores, similar] = await Promise.all([sameProductOffers(o), similarOffers(o)])
  return <OfferPageView o={o} stores={stores} similar={similar} faqs={offerFaqs(o, stores)} />
}
