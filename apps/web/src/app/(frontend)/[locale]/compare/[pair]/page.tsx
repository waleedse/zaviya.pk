import { notFound, permanentRedirect } from 'next/navigation'
import { ComparePageView, pairLabel } from '@/components/phones/PhoneViews'
import { getPhones } from '@/lib/phones/queries'
import { findPhone } from '@/lib/phones/pages'
import { findPair, popularPairs } from '@/lib/phones/logic'
import type { PhonePair, PhoneView } from '@/lib/phones/types'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 1800

type Params = { params: Promise<{ locale: string; pair: string }> }

/** /compare/<a>-vs-<b>: only the popular pairs exist; the same pair the other way round redirects to the canonical order */
type Resolved = { pair: PhonePair; a: PhoneView; b: PhoneView } | { redirect: string } | null

async function resolve(pairKey: string): Promise<Resolved> {
  const phones = await getPhones()
  const pairs = popularPairs(phones, 60)
  const direct = findPair(pairs, pairKey)
  if (direct) {
    const a = findPhone(phones, direct.a)
    const b = findPhone(phones, direct.b)
    return a && b ? { pair: direct, a, b } : null
  }
  const [x, y] = pairKey.split('-vs-')
  if (x && y && !pairKey.slice(x.length + 4).includes('-vs-')) {
    const swapped = findPair(pairs, `${y}-vs-${x}`)
    if (swapped) return { redirect: `/compare/${swapped.key}` }
  }
  return null
}

export async function generateMetadata({ params }: Params) {
  const { locale: raw, pair } = await params
  const locale = parseLocale(raw)
  const r = await resolve(pair)
  if (!r || 'redirect' in r) return { title: 'Not found', robots: { index: false } }
  const label = pairLabel(r.a, r.b)
  return buildPageMetadata({
    locale,
    title: `${label}: Price & Specs Compared`,
    description: `${label}: price in Pakistan, display, chipset, camera and battery compared side by side, with the official PKR prices.`,
    enPath: `/compare/${r.pair.key}`,
  })
}

export default async function ComparePage({ params }: Params) {
  const { locale: raw, pair } = await params
  const locale = parseLocale(raw)
  if (locale === 'ur') notFound()
  const r = await resolve(pair)
  if (!r) notFound()
  if ('redirect' in r) permanentRedirect(r.redirect)
  return <ComparePageView a={r.a} b={r.b} pair={r.pair} />
}
