import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'
import { renderLatestPage } from './latest-view'

export const revalidate = 60

export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'تازہ ترین خبریں' : 'Latest News from Pakistan and the World',
    description:
      locale === 'ur'
        ? 'زاویہ پر شائع ہونے والی تمام تازہ ترین خبریں ایک فہرست میں۔'
        : 'Every story published on Zaviya News, newest first: Pakistan, business, world, cricket, tech and more.',
    enPath: '/latest',
    urPath: '/ur/latest',
  })
}

export default async function LatestPage({ params }: { params: Promise<{ locale: string }> }) {
  return renderLatestPage(parseLocale((await params).locale), 1)
}
