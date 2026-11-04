import { ClosuresPage } from '@/components/vacations/VacationPages'
import { englishOnly } from '@/lib/english-only'
import { parseLocale } from '@/lib/locale'
import { getClosures } from '@/lib/results-data'
import { buildPageMetadata } from '@/lib/seo'
import { closuresPath } from '@/lib/vacations'
import { pktDate } from '@/lib/web-stories'

export const revalidate = 300

export async function generateMetadata() {
  return buildPageMetadata({
    locale: 'en',
    title: 'Schools Closed Tomorrow in Pakistan: Smog and Weather Closures',
    description: 'School closures announced for smog, rain and other reasons in Punjab, Sindh, KP, Balochistan and Islamabad, each with its source.',
    enPath: closuresPath(),
  })
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  englishOnly(parseLocale((await params).locale), closuresPath())
  return <ClosuresPage closures={await getClosures()} today={pktDate(new Date())} />
}
