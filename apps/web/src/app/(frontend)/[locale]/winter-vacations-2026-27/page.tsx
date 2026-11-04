import { VacationsHub } from '@/components/vacations/VacationPages'
import { englishOnly } from '@/lib/english-only'
import { parseLocale } from '@/lib/locale'
import { getClosures, getVacations } from '@/lib/results-data'
import { buildPageMetadata } from '@/lib/seo'
import { SEASON, vacationsHubPath } from '@/lib/vacations'
import { pktDate } from '@/lib/web-stories'

export const revalidate = 300

export async function generateMetadata() {
  return buildPageMetadata({
    locale: 'en',
    title: `Winter Vacations ${SEASON} in Pakistan: Dates by Province`,
    description: `Winter vacation dates ${SEASON} for Punjab, Sindh, KP, Balochistan and Islamabad, with the source of each date, last year's break and smog school closures.`,
    enPath: vacationsHubPath(),
  })
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  englishOnly(parseLocale((await params).locale), vacationsHubPath())
  const [vacations, closures] = await Promise.all([getVacations(), getClosures()])
  return <VacationsHub vacations={vacations} closures={closures} today={pktDate(new Date())} />
}
