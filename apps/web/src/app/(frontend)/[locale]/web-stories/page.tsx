import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GalleryVertical } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { localePath, t } from '@/lib/i18n'
import { parseLocale } from '@/lib/locale'
import { getStoryDigests } from '@/lib/queries'
import { buildPageMetadata } from '@/lib/seo'
import { dailyStorySlug, DIGEST_MIN, digestTitle, WEB_STORY_DAYS, webStoriesPath } from '@/lib/web-stories'

export const revalidate = 300

export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: 'Web Stories: the day\'s big news in swipeable stories',
    description: 'Swipe through the day\'s five biggest Pakistan stories and breaking news from Zaviya News as Google Web Stories.',
    enPath: '/web-stories',
  })
}

/** Index of the Web Stories of the last 7 days (ZAV-242); the stories themselves are English only. */
export default async function WebStoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  if (locale !== 'en') notFound()
  const d = t(locale)
  const digests = (await getStoryDigests(WEB_STORY_DAYS)).filter((x) => x.top.length >= DIGEST_MIN)
  return (
    <div className="pb-8">
      <PageHero
        title="Web Stories"
        description="The day's big news as quick, swipeable stories."
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: 'Web Stories' }]}
        icon={GalleryVertical}
        eyebrow="Swipe"
      />
      <div className="container-wide pt-8">
        {digests.length === 0 ? (
          <p className="text-fg-muted">No stories yet today. Check back soon.</p>
        ) : (
          <ul className="space-y-8">
            {digests.map((day) => (
              <li key={day.date}>
                <h2 className="font-display text-xl font-bold">
                  <Link href={webStoriesPath(dailyStorySlug(day.date))} className="hover:text-accent">
                    {digestTitle(day.date)}
                  </Link>
                </h2>
                <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-fg-muted">
                  {day.top.map((a) => (
                    <li key={a.id}>{a.title}</li>
                  ))}
                </ul>
                {day.breaking.length > 0 && (
                  <p className="mt-3 text-sm">
                    <span className="font-bold">Breaking:</span>{' '}
                    {day.breaking.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && ' · '}
                        <Link href={webStoriesPath(a.slug)} className="text-accent hover:underline">
                          {a.title}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
