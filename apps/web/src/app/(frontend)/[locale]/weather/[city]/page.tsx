import { notFound } from 'next/navigation'
import { CityWeatherView, weatherCitySeo } from '@/components/weather/WeatherViews'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { PK_CITIES } from '@/lib/prayer-times'
import { getCityWeather } from '@/lib/weather'

export const revalidate = 1800

type Props = { params: Promise<{ locale: string; city: string }> }

export function generateStaticParams() {
  return PK_CITIES.map((c) => ({ city: c.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { locale: l, city: slug } = await params
  const locale = parseLocale(l)
  const city = PK_CITIES.find((c) => c.slug === slug)
  if (!city) return {}
  const seo = weatherCitySeo(city, locale)
  return buildPageMetadata({
    locale,
    title: seo.title,
    description: seo.description,
    enPath: `/weather/${city.slug}`,
    urPath: `/ur/weather/${city.slug}`,
    absoluteTitle: true,
  })
}

export default async function CityWeatherPage({ params }: Props) {
  const { locale: l, city: slug } = await params
  const locale = parseLocale(l)
  const city = PK_CITIES.find((c) => c.slug === slug)
  if (!city) notFound()
  return <CityWeatherView locale={locale} city={city} weather={await getCityWeather(city.slug)} />
}
