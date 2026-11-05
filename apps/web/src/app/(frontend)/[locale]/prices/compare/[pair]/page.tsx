import { notFound, permanentRedirect } from 'next/navigation'
import { ApplianceCompareView } from '@/components/appliances/ApplianceViews'
import { getAppliances } from '@/lib/appliances/queries'
import { applianceIndexable, findComparePair } from '@/lib/appliances/logic'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; pair: string }> }

export async function generateMetadata({ params }: Params) {
  const { locale: raw, pair } = await params
  const r = findComparePair(pair, await getAppliances())
  if (!r) return { title: 'Not found', robots: { index: false } }
  const label = `${r.a.brand.name} ${r.a.name} vs ${r.b.brand.name} ${r.b.name}`
  return buildPageMetadata({
    locale: parseLocale(raw),
    title: `${label}: Price & Specs Compared`,
    description: `${label}: official prices in Pakistan and specs side by side, with links to buy from each brand's store.`.slice(0, 300),
    enPath: `/prices/compare/${r.key}`,
    noindex: !applianceIndexable(r.a) || !applianceIndexable(r.b),
  })
}

export default async function AppliancesComparePage({ params }: Params) {
  const { locale: raw, pair } = await params
  if (parseLocale(raw) === 'ur') notFound()
  const r = findComparePair(pair, await getAppliances())
  if (!r) notFound()
  if (r.key !== pair) permanentRedirect(`/prices/compare/${r.key}`)
  // The pair is sorted by slug; show the cheaper one first
  const [a, b] = (r.a.pricePkr ?? Infinity) <= (r.b.pricePkr ?? Infinity) ? [r.a, r.b] : [r.b, r.a]
  return <ApplianceCompareView a={a} b={b} />
}
