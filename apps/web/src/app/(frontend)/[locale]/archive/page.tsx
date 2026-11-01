import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { PageHero } from '@/components/layout/PageHero'
import { archiveDateLabel, archivePath } from '@/lib/archive'
import { localePath, t } from '@/lib/i18n'
import { parseLocale } from '@/lib/locale'
import { getArchiveDays } from '@/lib/queries'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? 'خبروں کا آرکائیو' : 'News archive: every day on Zaviya News',
    description:
      locale === 'ur'
        ? 'پچھلے 60 دنوں کی تمام خبریں، دن بہ دن۔'
        : 'Browse every story Zaviya News published, day by day, for the last 60 days.',
    enPath: '/archive',
    urPath: '/ur/archive',
  })
}

/** ZAV-281: index of the last 60 Pakistan days, each linking its /archive/YYYY-MM-DD hub. */
export default async function ArchiveIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  const d = t(locale)
  const isUr = locale === 'ur'
  const days = await getArchiveDays()
  return (
    <div className="pb-8">
      <PageHero
        title={isUr ? 'خبروں کا آرکائیو' : 'News archive'}
        description={isUr ? 'پچھلے 60 دنوں کی تمام خبریں، دن بہ دن۔' : 'Every story we published, day by day (last 60 days).'}
        crumbs={[{ label: d.nav.home, href: localePath(locale, '/') }, { label: isUr ? 'آرکائیو' : 'Archive' }]}
        icon={CalendarDays}
        color="#0f766e"
        eyebrow={isUr ? 'فہرست' : 'By day'}
      />
      <div className="container-wide pt-8">
        <ul className="card-surface divide-y divide-border p-5">
          {days.map((day) => (
            <li key={day.date} className="flex items-baseline justify-between gap-4 py-2">
              <Link href={localePath(locale, archivePath(day.date))} className="font-semibold hover:text-accent">
                {archiveDateLabel(day.date, locale)}
              </Link>
              <span className="text-xs text-fg-muted">
                {day.count} {isUr ? 'خبریں' : 'stories'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
