import { notFound } from 'next/navigation'
import { VacationRegionPage } from '@/components/vacations/VacationPages'
import { englishOnly } from '@/lib/english-only'
import { parseLocale } from '@/lib/locale'
import { getClosures, getVacations } from '@/lib/results-data'
import { buildPageMetadata } from '@/lib/seo'
import { SEASON, vacationRegionBySlug, vacationRegionPath } from '@/lib/vacations'
import { pktDate } from '@/lib/web-stories'

export const revalidate = 300

export async function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ locale: string; region: string }> }

export async function generateMetadata({ params }: Props) {
  const r = vacationRegionBySlug((await params).region)
  if (!r) return {}
  return buildPageMetadata({
    locale: 'en',
    title: `Winter Vacations ${SEASON} in ${r.name}: Dates and School Closures`,
    description: `${r.name} winter vacation dates ${SEASON} with the source, last year's break and smog school closures.`,
    enPath: vacationRegionPath(r.slug),
  })
}

export default async function Page({ params }: Props) {
  const p = await params
  const region = vacationRegionBySlug(p.region)
  if (!region) notFound()
  englishOnly(parseLocale(p.locale), vacationRegionPath(region.slug))
  const [vacations, closures] = await Promise.all([getVacations(), getClosures()])
  const v = vacations.find((x) => x.region === region.slug) ?? { region: region.slug, status: 'not_announced' as const }
  return <VacationRegionPage region={region} v={v} closures={closures} today={pktDate(new Date())} />
}
