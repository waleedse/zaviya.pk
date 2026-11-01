import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { LatestList } from '@/components/article/LatestList'
import { PageHero } from '@/components/layout/PageHero'
import { archiveDateLabel, archivePath, isServedArchiveDate } from '@/lib/archive'
import { localePath, t } from '@/lib/i18n'
import { parseLocale } from '@/lib/locale'
import { getArchiveDay } from '@/lib/queries'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 300

export async function generateStaticParams() {
  return []
}

type Params = Promise<{ locale: string; date: string }>

export async function generateMetadata({ params }: { params: Params }) {
  const { locale: rawLocale, date } = await params
  const locale = parseLocale(rawLocale)
  if (!isServedArchiveDate(date)) return {}
  const label = archiveDateLabel(date, locale)
  const empty = (await getArchiveDay(locale, date)).length === 0
  return buildPageMetadata({
    locale,
    title: locale === 'ur' ? `${label} کی خبریں` : `News from ${label}`,
    description:
      locale === 'ur' ? `${label} کو زاویہ پر شائع ہونے والی تمام خبریں۔` : `Every story Zaviya News published on ${label}, newest first.`,
    enPath: archivePath(date),
    urPath: `/ur${archivePath(date)}`,
    noindex: empty,
  })
}

/** ZAV-281: every published story of one Pakistan day as plain links, newest first. Dates outside the last 60 days or in the future are 404. */
export default async function ArchiveDayPage({ params }: { params: Params }) {
  const { locale: rawLocale, date } = await params
  const locale = parseLocale(rawLocale)
  if (!isServedArchiveDate(date)) notFound()
  const items = await getArchiveDay(locale, date)
  const d = t(locale)
  const isUr = locale === 'ur'
  const label = archiveDateLabel(date, locale)
  return (
    <div className="pb-8">
      <PageHero
        title={isUr ? `${label} کی خبریں` : `News from ${label}`}
        description={isUr ? 'اس دن شائع ہونے والی تمام خبریں، نئی سے پرانی۔' : 'Every story published that day, newest first.'}
        crumbs={[
          { label: d.nav.home, href: localePath(locale, '/') },
          { label: isUr ? 'آرکائیو' : 'Archive', href: localePath(locale, archivePath()) },
          { label },
        ]}
        icon={CalendarDays}
        color="#0f766e"
        eyebrow={isUr ? 'آرکائیو' : 'Archive'}
        stats={items.length ? [{ label: isUr ? 'خبریں' : 'stories', value: items.length }] : undefined}
      />
      <div className="container-wide pt-8">
        {items.length === 0 ? (
          <p className="text-fg-muted">{isUr ? 'اس دن کی کوئی خبر ابھی شائع نہیں ہوئی۔' : 'No stories published on this day yet.'}</p>
        ) : (
          <LatestList locale={locale} items={items} title={isUr ? `${label} کی خبریں` : `News from ${label}`} />
        )}
        <p className="mt-6 text-sm">
          <Link href={localePath(locale, archivePath())} className="font-semibold underline">
            {isUr ? 'تمام دنوں کا آرکائیو' : 'All days archive'}
          </Link>
          {' · '}
          <Link href={localePath(locale, '/latest')} className="font-semibold underline">
            {d.latest}
          </Link>
        </p>
      </div>
    </div>
  )
}
