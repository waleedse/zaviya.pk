import { notFound } from 'next/navigation'
import { offerGroupInfo } from '@zaviya/shared'
import { ShopGroupView } from '@/components/offers/OfferViews'
import { offerGroupSummaries, offersInGroup, type OfferSort } from '@/lib/offers/queries'
import { monthYear, shopGroupFaqs } from '@/lib/offers/copy'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

/** /prices/shop/<group>: one store category (laptops, cameras, perfume...) across Pakistani store websites */
type Props = { params: Promise<{ locale: string; group: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const SORTS = new Set<OfferSort>(['popular', 'low', 'high', 'drops'])
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

async function read(props: Props) {
  const [{ locale, group }, sp] = await Promise.all([props.params, props.searchParams])
  const sortRaw = one(sp.sort) as OfferSort | undefined
  const sort: OfferSort = sortRaw && SORTS.has(sortRaw) ? sortRaw : 'popular'
  const page = Math.min(500, Math.max(1, Number(one(sp.page)) || 1))
  const brand = one(sp.brand)?.slice(0, 60) || undefined
  return { locale: parseLocale(locale), group, sort, page, brand }
}

export async function generateMetadata(props: Props) {
  const { locale, group, sort, page, brand } = await read(props)
  const info = offerGroupInfo(group)
  if (!info) return { title: 'Not found', robots: { index: false } }
  const sum = (await offerGroupSummaries()).find((s) => s.slug === group)
  return buildPageMetadata({
    locale,
    title: `${info.name}${brand ? ` ${brand}` : ''} Prices in Pakistan Today (${monthYear()}) | Zaviya`,
    description: `${sum?.count ?? ''} ${info.name.toLowerCase()} with prices from Pakistani store websites${sum?.minPrice ? `, from Rs ${sum.minPrice.toLocaleString('en-US')}` : ''}. Compare stores, see price drops and buy from the store directly.`,
    enPath: `/prices/shop/${group}`,
    absoluteTitle: true,
    // filtered, sorted and later pages are copies of the main list
    noindex: !!brand || sort !== 'popular' || page > 1 || !sum || sum.count < 6 || group === 'other',
  })
}

export default async function ShopGroupPage(props: Props) {
  const { locale, group, sort, page, brand } = await read(props)
  if (locale === 'ur' || !offerGroupInfo(group)) notFound()
  const [{ items, total, brands }, sums] = await Promise.all([offersInGroup(group, { brand, sort, page }), offerGroupSummaries()])
  const minPrice = sums.find((s) => s.slug === group)?.minPrice ?? null
  return <ShopGroupView group={group} items={items} total={total} brands={brands} brand={brand} sort={sort} page={page} minPrice={minPrice} faqs={shopGroupFaqs(group, items, total)} />
}
