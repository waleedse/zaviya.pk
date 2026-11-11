import { WeatherHubView, weatherHubSeo } from '@/components/weather/WeatherViews'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { getHubWeather } from '@/lib/weather'

export const revalidate = 1800

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const seo = weatherHubSeo(locale)
  return buildPageMetadata({ locale, title: seo.title, description: seo.description, enPath: '/weather', urPath: '/ur/weather', absoluteTitle: true })
}

export default async function WeatherHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return <WeatherHubView locale={locale} weather={await getHubWeather()} />
}
