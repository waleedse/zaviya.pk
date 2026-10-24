import { NewsletterCTA } from '@/components/marketing/NewsletterCTA'
import { parseLocale } from '@/lib/locale'
import { buildPageMetadata } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'زاویہ کا صبح کا بریفنگ' : 'Zaviya Morning Briefing',
    description:
      locale === 'ur'
        ? 'ہر صبح پاکستان کی پانچ اہم ترین خبریں آپ کے ان باکس میں۔ ایک کلک میں ان سبسکرائب۔'
        : 'The five top Pakistan stories in your inbox every morning. Unsubscribe in one click.',
    enPath: '/subscribe',
    urPath: '/ur/subscribe',
    absoluteTitle: true,
  })
}

const STATUS = {
  confirmed: { en: 'You are subscribed. The briefing arrives every morning.', ur: 'آپ سبسکرائب ہو گئے۔ بریفنگ ہر صبح آئے گی۔' },
  unsubscribed: { en: 'You are unsubscribed. No more emails from us.', ur: 'آپ ان سبسکرائب ہو گئے۔ اب ہماری طرف سے کوئی ای میل نہیں آئے گی۔' },
  invalid: { en: 'This link is not valid or has expired.', ur: 'یہ لنک درست نہیں یا ختم ہو چکا ہے۔' },
} as const

export default async function SubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ status?: string }>
}) {
  const locale = parseLocale((await params).locale)
  const status = (await searchParams).status as keyof typeof STATUS | undefined
  const note = status && status in STATUS ? STATUS[status][locale === 'ur' ? 'ur' : 'en'] : null
  return (
    <div className="container-wide max-w-2xl py-10">
      {note && (
        <p role="status" className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-sm">
          {note}
        </p>
      )}
      <NewsletterCTA locale={locale} source="subscribe-page" />
    </div>
  )
}
