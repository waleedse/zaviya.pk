import { notFound, permanentRedirect } from 'next/navigation'
import { NamazPageView, namazSeo } from '@/components/namaz/NamazPageView'
import { parseLocale } from '@/lib/locale'
import { localePath } from '@/lib/i18n'
import { buildPageMetadata } from '@/lib/seo'
import { PK_CITIES } from '@/lib/prayer-times'

export const revalidate = 600

type Props = { params: Promise<{ locale: string; city: string }> }

export function generateStaticParams() {
  return PK_CITIES.slice(1).map((c) => ({ city: c.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { locale: l, city: slug } = await params
  const locale = parseLocale(l)
  const city = PK_CITIES.find((c) => c.slug === slug)
  if (!city) return {}
  const seo = namazSeo(city, locale)
  return buildPageMetadata({
    locale,
    title: seo.title,
    description: seo.description,
    enPath: `/namaz-timings/${city.slug}`,
    urPath: `/ur/namaz-timings/${city.slug}`,
    absoluteTitle: true,
  })
}

export default async function CityNamazPage({ params }: Props) {
  const { locale: l, city: slug } = await params
  const locale = parseLocale(l)
  const city = PK_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()
  // The default city lives at /namaz-timings; keep one URL per page.
  if (city.slug === PK_CITIES[0]!.slug) permanentRedirect(localePath(locale, '/namaz-timings'))
  return <NamazPageView locale={locale} city={city} />
}
