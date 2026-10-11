import { NamazPageView, namazSeo } from '@/components/namaz/NamazPageView'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { PK_CITIES } from '@/lib/prayer-times'

// Times change once a day; the countdown runs in the browser.
export const revalidate = 600

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const seo = namazSeo(PK_CITIES[0]!, locale)
  return buildPageMetadata({ locale, title: seo.title, description: seo.description, enPath: '/namaz-timings', urPath: '/ur/namaz-timings', absoluteTitle: true })
}

export default async function NamazTimingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return <NamazPageView locale={locale} city={PK_CITIES[0]!} />
}
